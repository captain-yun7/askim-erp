import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { UiScaleSelect } from '@/components/settings/ui-scale-select'
import { UI_SCALE_COOKIE, parseUiScale } from '@/lib/ui-scale'
import { ProfileForm } from '@/components/profile/profile-form'
import { getSessionUser } from '@/server/auth/guards'

export default async function ProfilePage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const scale = parseUiScale((await cookies()).get(UI_SCALE_COOKIE)?.value)

  return (
    <div className="px-8 pb-8 pt-6">
      <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">내 프로필</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        계정 정보 및 비밀번호 관리
      </p>
      <section className="mt-5 flex max-w-lg items-center justify-between rounded-2xl border bg-card px-5 py-4">
        <div>
          <div className="text-sm font-medium">글자 크기</div>
          <div className="mt-0.5 text-xs text-muted-foreground">이 브라우저에서의 화면 전체 크기</div>
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
