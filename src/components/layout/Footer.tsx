import Link from "next/link";
import Image from "next/image";
import { Phone } from "lucide-react";

function InstagramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function FacebookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function LinkedInIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

function YouTubeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </svg>
  );
}

const socialLinks = [
  { href: "https://instagram.com/relicbuilt", icon: InstagramIcon, label: "Instagram" },
  { href: "https://facebook.com/relicbuilt", icon: FacebookIcon, label: "Facebook" },
  { href: "https://linkedin.com/company/relicbuilt", icon: LinkedInIcon, label: "LinkedIn" },
  { href: "https://youtube.com/@relicbuilt", icon: YouTubeIcon, label: "YouTube" },
];

export default function Footer() {
  return (
    <footer className="bg-card border-t border-border">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Image src="/logo-emblem.png" alt="Relic" width={32} height={32} className="h-8 w-8" />
              <h3 className="text-2xl font-bold tracking-widest font-heading">R&ensp;E&ensp;L&ensp;I&ensp;C</h3>
            </div>
            <p className="text-muted text-sm leading-relaxed">
              Custom woodworking and metalworks. Built with dedication to
              craftsmanship, purpose, and care.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="text-sm uppercase tracking-wider text-accent mb-4">
              Navigation
            </h4>
            <div className="flex flex-col gap-2">
              <Link href="/work" className="text-muted text-sm hover:text-foreground transition-colors">Work</Link>
              <Link href="/about" className="text-muted text-sm hover:text-foreground transition-colors">About</Link>
              <Link href="/shop" className="text-muted text-sm hover:text-foreground transition-colors">Shop</Link>
              <Link href="/contact" className="text-muted text-sm hover:text-foreground transition-colors">Contact</Link>
              <Link href="/new-client" className="text-muted text-sm hover:text-foreground transition-colors">New Client Form</Link>
              <Link href="/book" className="text-muted text-sm hover:text-foreground transition-colors">Book Appointment</Link>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm uppercase tracking-wider text-accent mb-4">
              Contact
            </h4>
            <a
              href="tel:4022358179"
              className="flex items-center gap-2 text-muted text-sm hover:text-foreground transition-colors mb-4"
            >
              <Phone size={16} />
              (402) 235-8179
            </a>
            <div className="flex gap-4">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted hover:text-accent transition-colors"
                  aria-label={social.label}
                >
                  <social.icon size={20} />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border text-center text-muted text-xs">
          &copy; {new Date().getFullYear()} Relic Built. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
