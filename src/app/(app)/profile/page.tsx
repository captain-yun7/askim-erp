import { redirect } from 'next/navigation'
import { UiScaleSelect } from '@/components/settings/ui-scale-select'
import { getMyUiScale } from '@/server/queries/ui-scale'
import { ProfileForm } from '@/components/profile/profile-form'
import { getSessionUser } from '@/server/auth/guards'

export default async function ProfilePage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const scale = await getMyUiScale()

  return (
    <div className="px-8 pb-8 pt-6">
      <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">내 프로필</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        계정 정보 및 비밀번호 관리
      </p>
      <section className="mt-5 flex max-w-lg items-center justify-between rounded-2xl border bg-card px-5 py-4">
        <div>
          <div className="text-sm font-medium">글자 크기</div>
          <div className="mt-0.5 text-xs text-muted-foreground">내 계정에 저장 · 어디서 로그인해도 동일</div>
        </div>
        <UiScaleSelect current={scale} />
      </section>
      <div className="mt-5">
        <ProfileForm
          initial={{
            name: user.name ?? '',
            email: user.email ?? '',
            role: user.role,
            team: user.team,
          }}
        />
      </div>
    </div>
  )
}
