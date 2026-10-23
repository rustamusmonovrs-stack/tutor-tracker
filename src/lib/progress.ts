import type { Lesson, Topic } from "./types";

export function sortTopics(topics: Topic[]): Topic[] {
  return [...topics].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
}

/**
 * The topic a student works on next: the first one (by position) without a fully completed homework.
 * Pass only the lessons dated before the day you are planning for.
 * Derived from lessons, so there is no pointer that can drift out of sync.
 */
export function currentTopic(topics: Topic[], lessons: Lesson[]): Topic | null {
  const done = new Set(
    lessons.filter((l) => l.homework === "full" && l.topic_id).map((l) => l.topic_id as string),
  );
  return sortTopics(topics).find((t) => !done.has(t.id)) ?? null;
}

/** How many lessons were spent on this topic without finishing it (partial / not done homework). */
export function repeatCount(topic: Topic | null, lessons: Lesson[]): number {
  if (!topic) return 0;
  return lessons.filter(
    (l) => l.topic_id === topic.id && (l.homework === "partial" || l.homework === "not_done"),
  ).length;
}

export type TopicStatus = "done" | "current" | "upcoming";

export function topicStatuses(topics: Topic[], lessons: Lesson[]): Map<string, TopicStatus> {
  const current = currentTopic(topics, lessons);
  const done = new Set(
    lessons.filter((l) => l.homework === "full" && l.topic_id).map((l) => l.topic_id as string),
  );
  const map = new Map<string, TopicStatus>();
  for (const t of topics) {
    map.set(t.id, done.has(t.id) ? "done" : current?.id === t.id ? "current" : "upcoming");
  }
  return map;
}
