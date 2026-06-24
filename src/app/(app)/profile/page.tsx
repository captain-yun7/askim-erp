import { redirect } from 'next/navigation'
import { ProfileForm } from '@/components/profile/profile-form'
import { getSessionUser } from '@/server/auth/guards'

export default async function ProfilePage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return (
    <div className="px-8 pb-8 pt-6">
      <h1 className="text-[22px] font-bold tracking-tight">내 프로필</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        계정 정보 및 비밀번호 관리
      </p>
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
