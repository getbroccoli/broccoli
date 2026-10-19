/** How many people the ring shows at once. */
export const RING_SEATS = 10;

/**
 * Who sits in each seat after `swaps` swaps: each swap gives the next seat, in turn, to the
 * next person not shown, so everyone comes round and no one shows twice.
 */
export function ringSeats<Person>(people: readonly Person[], swaps: number): Person[] {
  if (people.length <= RING_SEATS) {
    return [...people];
  }
  return Array.from({ length: RING_SEATS }, (_, seat) => {
    const turn = seat + RING_SEATS * Math.floor((RING_SEATS - 1 + swaps - seat) / RING_SEATS);
    return people[turn % people.length]!;
  });
}
