export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-3 px-6 py-24">
      <p className="font-mono text-xs text-muted-foreground">
        iskra / scaffold
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        Каркас приложения готов
      </h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        Next.js App Router, TypeScript, Tailwind CSS и shadcn/ui подключены и
        собираются. Продуктовый интерфейс и бизнес-логика здесь намеренно не
        реализованы — они появляются в отдельных feature-ветках через pull
        request.
      </p>
    </main>
  );
}
