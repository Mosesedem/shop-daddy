import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import heroImg from "@/assets/hero.jpg";
import { fetchProducts } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
  });
  const featured = products.slice(0, 3);

  return (
    <>
      {/* Hero */}
      <section className="container-page pt-10 md:pt-16">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-accent">New arrivals · Autumn</div>
            <h1 className="mt-4 font-display text-5xl md:text-6xl lg:text-7xl leading-[1.05]">
              Considered objects for the <em className="not-italic text-accent">everyday</em> home.
            </h1>
            <p className="mt-6 text-muted-foreground max-w-md">
              Small-batch ceramics, linen textiles and kitchen essentials — made slowly,
              designed to be used, kept, and passed on.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/shop" className="btn-primary hover:btn-primary-hover">
                Shop the edit <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/shop" className="btn-outline">Our story</Link>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-[4/5] rounded-3xl overflow-hidden bg-secondary">
              <img src={heroImg} alt="Editorial still life of ceramics and linens" width={1024} height={1280} className="w-full h-full object-cover" />
            </div>
            <div className="hidden md:block absolute -bottom-6 -left-6 card-surface p-4 max-w-[220px] shadow-sm">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Free shipping</div>
              <div className="mt-1 text-sm">On orders over ₦50,000 across Nigeria.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured */}
      <section className="container-page mt-24 md:mt-32">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Featured</div>
            <h2 className="font-display text-3xl md:text-4xl mt-2">A small, careful edit</h2>
          </div>
          <Link to="/shop" className="text-sm underline decoration-accent underline-offset-4">View all</Link>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* Values */}
      <section className="container-page mt-24 md:mt-32">
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { t: "Made slowly", d: "We work with small studios and independent makers who take their time." },
            { t: "Shipped kindly", d: "Plastic-free packaging, carbon-considered shipping across Nigeria." },
            { t: "Kept forever", d: "Quiet objects designed to be used every day and passed on." },
          ].map((f) => (
            <div key={f.t} className="card-surface p-6">
              <h3 className="font-display text-xl">{f.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
