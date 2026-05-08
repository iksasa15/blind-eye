import { useState } from "react"
import {
  Sparkles,
  Rocket,
  Palette,
  Zap,
  Code2,
  Moon,
  Sun,
  ArrowLeft,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const features = [
  {
    icon: Zap,
    title: "سريع جداً",
    description: "Vite يوفر تجربة تطوير فائقة السرعة مع Hot Module Replacement.",
  },
  {
    icon: Palette,
    title: "تصميم أنيق",
    description: "مكونات shadcn/ui احترافية + Tailwind CSS v4 جاهزة للاستخدام.",
  },
  {
    icon: Rocket,
    title: "TypeScript",
    description: "أمان أنواع كامل وتجربة تطوير ممتازة بدون أخطاء وقت التشغيل.",
  },
  {
    icon: Sparkles,
    title: "دعم RTL",
    description: "جاهز للعربية مع دعم كامل لاتجاه الكتابة من اليمين لليسار.",
  },
]

function App() {
  const [isDark, setIsDark] = useState(false)
  const [count, setCount] = useState(0)

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle("dark", next)
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b border-border/40 backdrop-blur-md bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center">
              <Sparkles className="size-5 text-white" />
            </div>
            <span className="font-bold text-lg">مشروعي</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://react.dev"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Code2 className="size-4" />
                المستندات
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6">
        <section className="py-24 md:py-32 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border bg-muted/50 text-sm text-muted-foreground mb-6">
            <Sparkles className="size-3.5" />
            <span>أهلاً بك في مشروعك الجديد</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
            ابنِ شيئاً
            <br />
            رائعاً اليوم
          </h1>

          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
            مشروع React جاهز بكل ما تحتاجه: Vite، TypeScript، Tailwind CSS، و
            shadcn/ui. ابدأ التطوير مباشرة.
          </p>

          <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
            <Button size="lg" onClick={() => setCount((c) => c + 1)}>
              ابدأ الآن
              <ArrowLeft className="size-4" />
            </Button>
            <Button size="lg" variant="outline">
              تصفح المكونات
            </Button>
          </div>

          {count > 0 && (
            <p className="mt-6 text-sm text-muted-foreground">
              ضغطت <span className="font-semibold text-foreground">{count}</span>{" "}
              {count === 1 ? "مرة" : "مرات"} — الـ State يعمل بنجاح!
            </p>
          )}
        </section>

        <section className="py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">
              كل ما تحتاجه في مكان واحد
            </h2>
            <p className="mt-3 text-muted-foreground">
              أدوات حديثة لبناء تطبيقات ويب احترافية
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature) => (
              <Card
                key={feature.title}
                className="hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                <CardHeader>
                  <div className="size-10 rounded-lg bg-primary/10 grid place-items-center mb-2">
                    <feature.icon className="size-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                  <CardDescription className="leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className="py-16">
          <Card className="bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-transparent border-violet-500/20">
            <CardContent className="py-8 text-center">
              <h3 className="text-2xl md:text-3xl font-bold mb-2">
                جاهز للانطلاق؟
              </h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                ابدأ بتعديل <code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-sm">src/App.tsx</code>{" "}
                وشاهد التغييرات فوراً
              </p>
              <Button size="lg">
                <Rocket className="size-4" />
                انطلق
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border/40 mt-16">
        <div className="container mx-auto px-6 py-8 text-center text-sm text-muted-foreground">
          صُنع بـ ♥ باستخدام React + Vite + Tailwind + shadcn/ui
        </div>
      </footer>
    </div>
  )
}

export default App
