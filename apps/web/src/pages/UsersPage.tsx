import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createUserSchema,
  USER_ROLES,
  USER_ROLE_LABELS,
  UserRole,
  type CreateUserInput,
  type User,
} from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { Badge, Button, Card, Combobox, Field, Input, Modal, Spinner } from '../components/ui';
import { useAuthStore } from '../stores/auth';

export function UsersPage() {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Kullanıcılar</h2>
        <Button onClick={() => setAdding(true)}>+ Yeni</Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-4">
          {users?.map((u) => <UserRow key={u.id} user={u} onEdit={() => setEditing(u)} />)}
        </div>
      )}

      {adding && (
        <Modal title="Yeni Kullanıcı" onClose={() => setAdding(false)}>
          <CreateUserForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </Modal>
      )}
      {editing && (
        <Modal
          title="Kullanıcıyı Düzenle"
          description={editing.email}
          onClose={() => setEditing(null)}
        >
          <UserEditForm
            user={editing}
            onDone={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}

const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN: 'bg-purple-100 text-purple-700',
  SUPERVISOR: 'bg-blue-100 text-blue-700',
  OPERATOR: 'bg-slate-100 text-slate-700',
};

function UserRow({ user, onEdit }: { user: User; onEdit: () => void }) {
  return (
    <Card className="flex items-center justify-between">
      <div>
        <p className="font-semibold text-slate-900">
          {user.fullName}
          {!user.isActive && <span className="ml-2 text-xs text-red-500">(pasif)</span>}
        </p>
        <p className="text-xs text-slate-500">{user.email}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge className={ROLE_COLORS[user.role]}>{USER_ROLE_LABELS[user.role]}</Badge>
        <button onClick={onEdit} className="text-sm font-medium text-brand">
          Düzenle
        </button>
      </div>
    </Card>
  );
}

function UserEditForm({
  user,
  onDone,
  onCancel,
}: {
  user: User;
  onDone: () => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const myId = useAuthStore((s) => s.user?.id);
  const [role, setRole] = useState<UserRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [newPassword, setNewPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<User>(`/users/${user.id}`, {
        role,
        isActive,
        ...(newPassword ? { password: newPassword } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      onDone();
      toast('Kullanıcı güncellendi');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Güncellenemedi'),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Rol">
          <Combobox
            options={USER_ROLES.map((r) => ({ value: r, label: USER_ROLE_LABELS[r] }))}
            value={role}
            onChange={(v) => setRole(v as UserRole)}
            disabled={user.id === myId}
          />
        </Field>
        <Field label="Durum">
          <Combobox
            options={[
              { value: '1', label: 'Aktif' },
              { value: '0', label: 'Pasif' },
            ]}
            value={isActive ? '1' : '0'}
            onChange={(v) => setIsActive(v === '1')}
            disabled={user.id === myId}
          />
        </Field>
      </div>
      <Field label="Yeni Şifre (boş bırakılırsa değişmez)">
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Şifre sıfırla"
        />
      </Field>
      {user.id === myId && (
        <p className="text-xs text-amber-600">Kendi rol/durumunuzu değiştiremezsiniz.</p>
      )}
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
          Vazgeç
        </Button>
        <Button className="flex-1" loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Kaydet
        </Button>
      </div>
    </div>
  );
}

function CreateUserForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: UserRole.OPERATOR },
  });

  const mutation = useMutation({
    mutationFn: (input: CreateUserInput) => api.post<User>('/users', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      reset();
      onDone();
      toast('Kullanıcı eklendi');
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Eklenemedi'),
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
      <Field label="Ad Soyad *" error={errors.fullName?.message}>
        <Input {...register('fullName')} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="E-posta *" error={errors.email?.message}>
          <Input type="email" {...register('email')} />
        </Field>
        <Field label="Rol *" error={errors.role?.message}>
          <Controller
            name="role"
            control={control}
            render={({ field }) => (
              <Combobox
                options={USER_ROLES.map((r) => ({ value: r, label: USER_ROLE_LABELS[r] }))}
                value={field.value ?? ''}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
      </div>
      <Field label="Şifre *" error={errors.password?.message}>
        <Input type="password" placeholder="En az 6 karakter" {...register('password')} />
      </Field>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
          Vazgeç
        </Button>
        <Button type="submit" className="flex-1" loading={mutation.isPending}>
          Kaydet
        </Button>
      </div>
    </form>
  );
}
