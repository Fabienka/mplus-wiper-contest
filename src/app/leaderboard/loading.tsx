import { PageSkeleton } from "../page-skeleton";

export default function LeaderboardLoading() {
  return (
    <main className="site-main site-main-wide">
      <PageSkeleton cards={2} />
    </main>
  );
}
