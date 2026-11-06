/** Short focus announcement; full IDs, hashes and recipes stay in expanded detail. */
export const speakScientificUnit = (unit: string) => {
  const known: Record<string, string> = {
    "m": "metres", "s": "seconds", "m/s": "metres per second",
    "m/s/m": "metres per second per metre", "1/s": "per second",
    "s^-1": "per second", "unit unavailable": "unit unavailable",
  };
  return known[unit.trim()] ?? unit.replaceAll("/", " per ").replaceAll("^", " to the power of ");
};

export const scientificSpeechSummary = (item: Readonly<{ title: string;
  kind: string; status: string; detail: string }>) => {
  const unit = item.detail.match(/\bUnit ([^;,.]+)/i)?.[1];
  const coordinateUnits = item.detail.match(/coordinate units ([^.;]+)/i)?.[1];
  const revision = item.detail.match(/source revision (\d+)/i)?.[1];
  const unavailable = item.detail.match(/Values withheld: ([^.;]+)/i)?.[1];
  const unitPhrase = item.kind === "Poincaré Graph row" ? (() => {
    const axis = item.detail.match(/axis unit ([^,;]+)/i)?.[1];
    const value = item.detail.match(/value unit ([^,;]+)/i)?.[1];
    return axis && value ? `Axis unit ${speakScientificUnit(axis)}. ` +
      `Value unit ${speakScientificUnit(value)}.` : "";
  })() : unit ? `Unit ${speakScientificUnit(unit)}.` : coordinateUnits ?
    `Coordinate units ${coordinateUnits.split(",").map(speakScientificUnit).join(", ")}.` : "";
  const status = unavailable ?
    `Values withheld because ${unavailable.replaceAll("-", " ")}.` :
    item.status === "unverified" ? "Source unverified. Scientific values withheld." :
      item.status === "recipe retained" ?
        "Saved recipe retained. Values require verification before display." :
        `Status ${item.status.replaceAll("-", " ")}.`;
  return `${item.title}. ${unitPhrase} ${revision ? `Source revision ${revision}. ` : ""}` +
    `${status} Expand for full provenance.`.replace(/\s+/g, " ").trim();
};
