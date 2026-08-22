import Image from 'next/image'
import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image src="/brand/askim-symbol.png" alt="" width={72} height={28} priority />
          <div className="flex items-center gap-2">
            <Image
              src="/brand/askim-wordmark-white.png"
              alt="ASKIM"
              width={70}
              height={20}
              className="invert"
              priority
            />
            <span className="text-sm font-medium tracking-wide text-subtle-foreground">ERP</span>
          </div>
          <p className="text-sm text-muted-foreground">매출·매입 통합관리</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
