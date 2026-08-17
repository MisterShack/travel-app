import { useId } from 'react';
import type { Passenger } from '@travel/shared';

/**
 * Who is on this flight, and where they are sitting.
 *
 * A single "Seat" field could hold a family booking only by throwing three of
 * them away, which is what it did — the case this app exists for is a family
 * travelling together, not one person with one seat.
 *
 * A name is optional. Airline confirmations often state seats and no names, and
 * refusing the seats over a missing name would be the wrong trade.
 */
export function PassengerFields({
  passengers,
  onChange,
}: {
  passengers: Passenger[];
  onChange: (next: Passenger[]) => void;
}) {
  const groupId = useId();

  const update = (index: number, patch: Partial<Passenger>) =>
    onChange(passengers.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  return (
    <fieldset className="passengers">
      <legend>Who is travelling</legend>
      {passengers.map((p, i) => (
        <div className="passenger" key={i}>
          <div className="grow">
            <label className="field-label" htmlFor={`${groupId}-name-${i}`}>
              Name
            </label>
            <input
              id={`${groupId}-name-${i}`}
              value={p.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Optional"
            />
          </div>
          <div className="seat">
            <label className="field-label" htmlFor={`${groupId}-seat-${i}`}>
              Seat
            </label>
            <input
              id={`${groupId}-seat-${i}`}
              value={p.seat}
              onChange={(e) => update(i, { seat: e.target.value })}
              placeholder="14C"
            />
          </div>
          {/* The last row never offers removal: there must always be somewhere
              to type, and an empty row costs nothing because blank rows are
              dropped on save. */}
          {passengers.length > 1 && (
            <button
              type="button"
              className="secondary remove"
              onClick={() => onChange(passengers.filter((_, j) => j !== i))}
            >
              <span aria-hidden="true">×</span>
              <span className="visually-hidden">
                Remove {p.name === '' ? `passenger ${i + 1}` : p.name}
              </span>
            </button>
          )}
        </div>
      ))}
      <div className="actions">
        <button
          type="button"
          className="secondary"
          onClick={() => onChange([...passengers, { name: '', seat: '' }])}
        >
          Add another passenger
        </button>
      </div>
    </fieldset>
  );
}
