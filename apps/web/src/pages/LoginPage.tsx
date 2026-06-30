import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Navigate } from 'react-router-dom';
import { loginSchema, type LoginInput, type LoginResponse } from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { Button, Field, Input } from '../components/ui';

export function LoginPage() {
  const { token, setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  if (token) return <Navigate to="/" replace />;

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    try {
      const res = await api.post<LoginResponse>('/auth/login', values);
      setAuth(res.accessToken, res.user);
      navigate('/', { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Giriş başarısız');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-white p-6 shadow-xl">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-brand text-2xl">
            📦
          </div>
          <h1 className="text-xl font-bold text-slate-900">Tesellüm & Depo</h1>
          <p className="text-sm text-slate-500">Giriş yapın</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="E-posta" error={errors.email?.message}>
            <Input type="email" placeholder="ornek@firma.com" {...register('email')} />
          </Field>
          <Field label="Şifre" error={errors.password?.message}>
            <Input type="password" placeholder="••••••" {...register('password')} />
          </Field>

          {serverError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{serverError}</p>
          )}

          <Button type="submit" className="w-full" loading={isSubmitting}>
            Giriş Yap
          </Button>
        </form>

        <p className="text-center text-xs text-slate-400">
          Demo: admin@lojistik.local / admin123
        </p>
      </div>
    </div>
  );
}
