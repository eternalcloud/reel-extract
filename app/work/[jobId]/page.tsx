import WorkJobClient from "./work-job-client";

export default async function WorkJobPage({
  params
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <WorkJobClient jobId={jobId} />;
}
