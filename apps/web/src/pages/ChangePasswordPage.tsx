import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { changePasswordSchema, type ChangePasswordInput } from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { Button, Card, Field, Input } from '../components/ui';

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = async (values: ChangePasswordInput) => {
    setServerError(null);
    try {
      await api.post('/auth/change-password', values);
      reset();
      toast('🔑 Şifre güncellendi');
      navigate(-1);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Güncellenemedi');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-slate-500">
          ← Geri
        </button>
        <h2 className="text-xl font-bold text-slate-900">Şifre Değiştir</h2>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <Field label="Mevcut Şifre *" error={errors.currentPassword?.message}>
            <Input type="password" {...register('currentPassword')} />
          </Field>
          <Field label="Yeni Şifre *" error={errors.newPassword?.message}>
            <Input type="password" placeholder="En az 6 karakter" {...register('newPassword')} />
          </Field>
          {serverError && <p className="text-sm text-red-600">{serverError}</p>}
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Kaydet
          </Button>
        </form>
      </Card>
    </div>
  );
}
