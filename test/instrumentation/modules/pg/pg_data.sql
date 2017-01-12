CREATE TABLE test (
  id serial NOT NULL,
  c1 varchar,
  c2 varchar
);
INSERT INTO test
  (c1, c2)
VALUES
  ('foo1', 'bar1'),
  ('foo2', 'bar2'),
  ('foo3', 'bar3'),
  ('foo4', 'bar4'),
  ('foo5', 'bar5');
