/**
 * The red star beside a label whose field cannot be left empty.
 *
 * One piece rather than a star typed into each label, so the colour and the spoken wording stay
 * the same everywhere. The star is decoration for anyone listening — "Titre étoile" means
 * nothing — so the word is said instead.
 */
export function RequiredMark() {
  return (
    <span className="text-destructive">
      <span aria-hidden="true">{" *"}</span>
      <span className="sr-only"> (obligatoire)</span>
    </span>
  );
}
