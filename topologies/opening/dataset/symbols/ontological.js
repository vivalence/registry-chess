const symbol = (slug, name, description, root = false) => ({
  slug,
  traits: ["ONTOLOGICAL", "LABELED", ...(root ? ["TOPOGRAPHICAL"] : [])],
  trait: { ONTOLOGICAL: {}, LABELED: { name, description }, ...(root ? { TOPOGRAPHICAL: {} } : {}) },
});

const FAMILIES = [
  ["A", "Flank openings", "Everything that is not 1. e4 or 1. d4 d5 / 1. d4 Nf6."],
  ["B", "Semi-open games", "1. e4 answered by anything but 1... e5."],
  ["C", "Open games", "1. e4 e5, and the French."],
  ["D", "Closed games", "1. d4 d5, and the Grünfeld."],
  ["E", "Indian defences", "1. d4 Nf6 with 2... e6 or 2... g6."],
];

// ECO A00–E99: five families × one hundred codes. the names ride the catalogued literals; the
// symbols are what a game wears.
const CODES = FAMILIES.flatMap(([family]) =>
  Array.from({ length: 100 }, (_, index) => {
    const code = `${family}${String(index).padStart(2, "0")}`;
    return symbol(`opening.eco.${code}`, `ECO ${code}`, `Encyclopaedia of Chess Openings code ${code}.`);
  }),
);

export default [
  symbol("opening", "Opening", "A named opening line. Core ontological dimension.", true),
  ...FAMILIES.map(([family, name, description]) => symbol(`opening.family.${family}`, name, description)),
  ...CODES,
];
