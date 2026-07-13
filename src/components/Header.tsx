import { Link } from "@tanstack/react-router";
import { ShoppingBag, User } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";

export function Header() {
  const { count } = useCart();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur border-b">
      <div className="container-page flex items-center justify-between py-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="font-display text-2xl tracking-tight">Maison<span className="text-accent">.</span></span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm">
          <Link to="/" activeOptions={{ exact: true }} className="hover:text-accent" activeProps={{ className: "text-accent" }}>Home</Link>
          <Link to="/shop" className="hover:text-accent" activeProps={{ className: "text-accent" }}>Shop</Link>
          <Link to="/account" className="hover:text-accent" activeProps={{ className: "text-accent" }}>Account</Link>
          {user?.isAdmin && (
            <Link to="/admin" className="hover:text-accent" activeProps={{ className: "text-accent" }}>Admin</Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <Link to={user ? "/account" : "/auth"} className="p-2 rounded-md hover:bg-muted" aria-label="Account">
            <User className="w-5 h-5" />
          </Link>
          <Link to="/cart" className="relative p-2 rounded-md hover:bg-muted" aria-label="Cart">
            <ShoppingBag className="w-5 h-5" />
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-accent text-accent-foreground text-[11px] leading-5 text-center font-medium">
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
