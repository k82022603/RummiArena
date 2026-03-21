export default function Loading() {
  return (
    <div className="flex items-center justify-center h-64" role="status" aria-label="로딩 중">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
}
