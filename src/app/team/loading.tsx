import { PageSkeleton } from "../page-skeleton";

export default function TeamLoading() {
  return (
    <main className="site-main site-main-wide">
      <PageSkeleton cards={3} />
    </main>
  );
}
