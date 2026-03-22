import UserRatingClient from "./UserRatingClient";

interface UserRatingPageProps {
  params: Promise<{ userId: string }>;
}

/**
 * 개인 ELO 프로필 페이지 (Server Component)
 * 비로그인 상태에서도 열람 가능
 */
export default async function UserRatingPage({
  params,
}: UserRatingPageProps) {
  const { userId } = await params;

  return <UserRatingClient userId={userId} />;
}
