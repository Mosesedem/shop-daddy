export function Footer() {
  return (
    <footer className="border-t mt-24">
      <div className="container-page py-12 grid gap-8 md:grid-cols-3 text-sm">
        <div>
          <div className="font-display text-2xl">Maison<span className="text-accent">.</span></div>
          <p className="mt-3 text-muted-foreground max-w-xs">Considered objects for the everyday home. Made slowly, shipped kindly.</p>
        </div>
        <div>
          <h4 className="font-medium mb-3">Shop</h4>
          <ul className="space-y-2 text-muted-foreground">
            <li>Ceramics</li><li>Textiles</li><li>Kitchen</li><li>Home</li>
          </ul>
        </div>
        <div>
          <h4 className="font-medium mb-3">Company</h4>
          <ul className="space-y-2 text-muted-foreground">
            <li>Our story</li><li>Shipping & returns</li><li>Contact</li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <div className="container-page py-4 text-xs text-muted-foreground flex justify-between">
          <span>© {new Date().getFullYear()} Maison Studio</span>
          <span>Made with care.</span>
        </div>
      </div>
    </footer>
  );
}
