import AuthPanel from "../components/Auth";

export function Main() {
  return (
    <main className="flex items-center justify-center pt-16 pb-4">
      <div className="container mx-auto">
        <div className="mt-8 flex justify-center">
          <AuthPanel />
        </div>
      </div>
    </main>
  );
}
