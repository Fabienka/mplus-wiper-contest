import { PageSkeleton } from "../page-skeleton";

export default function ProfileLoading() {
  return (
    <main className="site-main">
      <PageSkeleton cards={3} />
    </main>
  );
}
