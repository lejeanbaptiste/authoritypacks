/**
 * Attach source-preserving appointment assertions to person candidates. The
 * crosswalk aliases make a CBDB/Norbert-linked person receive both sources'
 * appointments in the combined pack.
 */
export function attachAppointmentsToPersons(people, appointments) {
  const byPerson = new Map();
  for (const appointment of appointments) {
    const ref = appointment.person;
    if (!ref?.source || !ref.authorityId) continue;
    const key = `${String(ref.source).toLowerCase()}:${ref.authorityId}`;
    const list = byPerson.get(key) ?? [];
    list.push(appointment);
    byPerson.set(key, list);
  }

  for (const person of people) {
    const keys = [`${String(person.source).toLowerCase()}:${person.authorityId}`];
    for (const [source, value] of Object.entries(person.metadata?.crosswalk ?? {})) {
      if (typeof value === 'string') keys.push(`${source.toLowerCase()}:${value}`);
    }
    const merged = [...new Map(
      keys.flatMap((key) => byPerson.get(key) ?? [])
        .map((appointment) => [
          `${appointment.source}:${appointment.authorityId}`,
          appointment,
        ]),
    ).values()];
    if (merged.length) {
      person.metadata ??= {};
      person.metadata.appointments = merged;
    }
  }
  return people;
}

