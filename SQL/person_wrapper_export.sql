-- Norbert person-wrapper source export.
--
-- These rows are matcher input, not project entities. Keep the component
-- columns separate so the LJB plugin can emit nested TEI:
--   name[type=personWrapper] > roleName / nobleTitle / persName
--
-- person_nt layout:
--   ind, person_id, dyn, fief, pn, pn_abr, nt, tn, 戶, place_id,
--   start_year, end_year, dyn_id, ...

SELECT
    nt.ind AS noble_title_row_id,
    nt.person_id,
    p.can_name,
    nt.dyn AS dynasty,
    nt.fief,
    nt.pn AS posthumous_name,
    nt.nt AS noble_rank,
    nt.tn AS temple_name,
    nt.place_id AS fief_place_id,
    nt.start_year,
    nt.end_year,
    nt.dyn_id
FROM person_nt AS nt
JOIN person AS p ON p.id = nt.person_id
WHERE p.can_name IS NOT NULL
  AND TRIM(p.can_name) <> '';
