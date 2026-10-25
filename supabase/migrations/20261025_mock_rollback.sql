-- Rollback for 20261025_mock.sql. Removes ONLY the mock tables (and their data).
-- Existing groups / students / lessons are not touched.
begin;
drop table if exists public.mock_section_scores;
drop table if exists public.mock_student_results;
drop table if exists public.mock_sections;
drop table if exists public.mocks;
drop function if exists public.mock_score_guard();
commit;
