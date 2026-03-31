"use client";

import { useEffect, useRef } from "react";

export interface AddressResult {
  formatted: string; // full address string
  street: string;    // e.g. "1234 Main St"
  city: string;
  state: string;     // 2-letter abbreviation
  zip: string;
}

// ── Script loader (singleton) ────────────────────────────────

const PLACES_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;
const pendingCallbacks: Array<() => void> = [];
let scriptState: "idle" | "loading" | "ready" = "idle";

function loadPlaces(cb: () => void) {
  if (scriptState === "ready") { cb(); return; }
  pendingCallbacks.push(cb);
  if (scriptState === "loading") return;
  scriptState = "loading";
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${PLACES_KEY}&libraries=places`;
  s.async = true;
  s.onload = () => {
    scriptState = "ready";
    pendingCallbacks.forEach((fn) => fn());
    pendingCallbacks.length = 0;
  };
  document.head.appendChild(s);
}

// ── Component ────────────────────────────────────────────────

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
  className?: string;
}

export default function AddressAutocomplete({ value, onChange, onSelect, placeholder = "Start typing an address…", className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    loadPlaces(() => {
      if (!inputRef.current || acRef.current) return;

      const ac = new google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: "us" },
        fields: ["address_components", "formatted_address"],
        types: ["address"],
      });
      acRef.current = ac;

      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place.address_components) return;

        const get = (type: string) =>
          place.address_components!.find((c) => c.types.includes(type))?.long_name ?? "";
        const getShort = (type: string) =>
          place.address_components!.find((c) => c.types.includes(type))?.short_name ?? "";

        const street = [get("street_number"), get("route")].filter(Boolean).join(" ");
        const city = get("locality") || get("sublocality_level_1") || get("neighborhood");
        const state = getShort("administrative_area_level_1");
        const zip = get("postal_code");
        const formatted = place.formatted_address ?? "";

        onChange(formatted);
        onSelect({ formatted, street, city, state, zip });
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      className={className}
    />
  );
}
