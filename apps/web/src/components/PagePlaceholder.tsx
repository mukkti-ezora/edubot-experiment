import { EmptyState, PageHead } from "./ui";
import "@/styles/pages/student.css";

/** Holds a route while its feature is being built, so navigation never dead-ends. */
export function PagePlaceholder({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="st-page">
      <PageHead title={title} sub={sub} />
      <EmptyState title="This page is being built" body="It will appear here soon. Everything else in EduBot keeps working meanwhile." />
    </div>
  );
}
