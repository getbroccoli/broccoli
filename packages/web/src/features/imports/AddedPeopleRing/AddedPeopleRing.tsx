import { useQuery } from "@apollo/client/react";
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";

import { AddedPeopleRingDocument } from "@/__generated__/graphql";
import { Avatar } from "@/features/employees";

import "./addedPeopleRing.css";
import { RING_SEATS, ringSeats } from "./ringSeats";

const RADIUS_PX = 108;
// Faces fly in from this many radii out.
const ENTRANCE_SCALE = 2.4;
const SWAP_INTERVAL_MS = 3_200;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * The people setup approve added, their photos first, circling the company's logo while the
 * owner creates their account or starts using Broccoli; nothing until they load, or when no one was added.
 */
export function AddedPeopleRing() {
  // shortcut: faces come from the first 100 import employees only; filter added ones on the
  // server once the ring should show everyone of a larger import.
  const { data } = useQuery(AddedPeopleRingDocument);
  const people = (data?.import.employees.edges ?? [])
    .map(({ node }) => node)
    .filter(({ leftOut, incompleteReason }) => !leftOut && incompleteReason === null)
    // Stable, so each group keeps its name order.
    .sort((a, b) => Number(b.avatarUrl !== null) - Number(a.avatarUrl !== null));
  const swaps = useSwaps(people.length > RING_SEATS);

  if (!data || data.import.readyEmployeeCount === 0) {
    return null;
  }
  const { company } = data;
  const seats = ringSeats(people, swaps);
  return (
    <div aria-hidden className="relative mx-auto h-[280px] w-[300px]">
      <div className="absolute inset-0 motion-safe:animate-[ring-turn_90s_linear_1.2s_infinite]">
        {seats.map((person, seat) => (
          <span
            key={seat}
            className="absolute top-1/2 left-1/2 -mt-[22px] -ml-[22px] motion-safe:animate-[ring-seat-in_0.9s_cubic-bezier(0.22,1,0.36,1)_both]"
            style={seatStyle(seat, seats.length)}
          >
            {/* Turns back as the ring turns, so the face stays upright. */}
            <span className="block motion-safe:animate-[ring-turn_90s_linear_1.2s_infinite_reverse]">
              {/* Flips to each new face; the hue colours the initials of someone without a photo. */}
              <span
                key={person.id}
                style={{ "--tint-hue": hueOf(person.id) } as CSSProperties}
                className="block backface-hidden motion-safe:animate-[ring-face-flip_0.7s_cubic-bezier(0.22,1,0.36,1)_both]"
              >
                <Avatar
                  url={person.avatarUrl ?? null}
                  firstName={person.firstName.value ?? ""}
                  lastName={person.lastName.value ?? ""}
                  className="size-11 text-[13px] ring-[3px] ring-card"
                />
              </span>
            </span>
          </span>
        ))}
      </div>
      <span className="absolute top-1/2 left-1/2 -mt-10 -ml-10 flex size-20 items-center justify-center overflow-hidden rounded-[28%] bg-brand-soft text-3xl font-semibold text-brand-deep shadow-[0_12px_30px_-12px_rgba(33,30,23,0.35)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-90 motion-safe:duration-500">
        {company.logoUrl ? (
          <img src={company.logoUrl} alt="" className="size-full object-cover" />
        ) : (
          [...(company.name ?? "")][0]?.toUpperCase()
        )}
      </span>
    </div>
  );
}

/** A seat on the ring, the first at 12 o'clock; it flies in from further out on the same line. */
function seatStyle(seat: number, count: number): CSSProperties {
  const angle = (seat / count) * 2 * Math.PI - Math.PI / 2;
  const x = Math.cos(angle) * RADIUS_PX;
  const y = Math.sin(angle) * RADIUS_PX;
  return {
    translate: `${x}px ${y}px`,
    animationDelay: `${0.1 + seat * 0.05}s`,
    "--ring-from": `${x * ENTRANCE_SCALE}px ${y * ENTRANCE_SCALE}px`,
  } as CSSProperties;
}

/** A hue of its own for each person, the same on every visit. */
function hueOf(id: string): number {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return hash;
}

/** Counts swaps every few seconds while there are more people than seats, unless motion is reduced. */
function useSwaps(swapping: boolean): number {
  const [swaps, setSwaps] = useState(0);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!swapping || reducedMotion) {
      return;
    }
    const timer = window.setInterval(() => setSwaps((done) => done + 1), SWAP_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [swapping, reducedMotion]);
  return swaps;
}

/** Whether the owner asks for reduced motion, following changes while the page is open. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_MOTION);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
  );
}
