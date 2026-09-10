import { PageSkeleton } from "../page-skeleton";

/** Postranní navigace administrace zůstane, obsah se překreslí kostrou. */
export default function AdminLoading() {
  return <PageSkeleton cards={2} />;
}
