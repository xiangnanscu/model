WITH
  V (name, age) AS (
    VALUES
      ('tom'::varchar, 22::integer),
      ('kate', 21),
      ('mike', 11),
      ('foo', 11)
  ),
  U AS (
    UPDATE usr W
    SET
      age = V.age
    FROM
      V
    WHERE
      V.name = W.name
    RETURNING
      V.name,
      V.age
  )
INSERT INTO
  usr AS T (name, age)
SELECT
  V.name,
  V.age
FROM
  V
  LEFT JOIN U AS W ON (V.name = W.name)
WHERE
  W.n IS NULL