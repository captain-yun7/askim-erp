import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">에스킴 ERP</h1>
          <p className="mt-1 text-sm text-zinc-500">매출·매입 통합관리</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
