import { MEMBER_STATUS_ACTIVE, SPACE_STATUS_ACTIVE } from '../packages/types/src';
import type {
  AuditLogRecord,
  CalendarEventRecord,
  HolidayRecord,
  MealPlanRecord,
  MealTemplateRecord,
  PeriodRecordRecord,
  Repo,
  RestaurantRecord,
  RestaurantVisitRecord,
  SpaceMemberRecord,
  SpaceRecord,
  SpaceSettingRecord,
  TodoRecord,
  TrashRecord,
  UserIdentityRecord,
  UserRecord,
} from '../apps/miniprogram/cloudfunctions/_shared/repo';

/**
 * 内存版数据仓储：与 CloudRepo 实现同一个 Repo 接口，
 * 用于在不连接云数据库的情况下运行跨 Space 安全测试。
 */
export class MemoryRepo implements Repo {
  users = new Map<string, UserRecord>();
  userIdentities = new Map<string, UserIdentityRecord>();
  spaces = new Map<string, SpaceRecord>();
  spaceMembers = new Map<string, SpaceMemberRecord>();
  audits: AuditLogRecord[] = [];
  todos = new Map<string, TodoRecord>();
  calendarEvents = new Map<string, CalendarEventRecord>();
  periodRecords = new Map<string, PeriodRecordRecord>();
  holidays = new Map<string, HolidayRecord>();
  spaceSettings = new Map<string, SpaceSettingRecord>();
  mealTemplates = new Map<string, MealTemplateRecord>();
  mealPlans = new Map<string, MealPlanRecord>();
  trash = new Map<string, TrashRecord>();
  restaurants = new Map<string, RestaurantRecord>();
  restaurantVisits = new Map<string, RestaurantVisitRecord>();

  async findUserIdentity(provider: string, providerUserId: string): Promise<UserIdentityRecord | null> {
    for (const item of this.userIdentities.values()) {
      if (item.provider === provider && item.providerUserId === providerUserId) {
        return { ...item };
      }
    }
    return null;
  }

  async createUser(user: UserRecord): Promise<void> {
    this.users.set(user.id, { ...user });
  }

  async createUserIdentity(identity: UserIdentityRecord): Promise<void> {
    this.userIdentities.set(identity.id, { ...identity });
  }

  async findActiveMembershipByUser(userId: string): Promise<SpaceMemberRecord | null> {
    for (const member of this.spaceMembers.values()) {
      if (member.userId === userId && member.status === MEMBER_STATUS_ACTIVE) {
        return { ...member };
      }
    }
    return null;
  }

  async findSpaceById(spaceId: string): Promise<SpaceRecord | null> {
    const space = this.spaces.get(spaceId);
    return space ? { ...space } : null;
  }

  async findSpaceByInviteCode(inviteCode: string): Promise<SpaceRecord | null> {
    for (const space of this.spaces.values()) {
      if (space.inviteCode === inviteCode && space.status === SPACE_STATUS_ACTIVE) {
        return { ...space };
      }
    }
    return null;
  }

  async createSpace(space: SpaceRecord): Promise<void> {
    this.spaces.set(space.id, { ...space });
  }

  async createMember(member: SpaceMemberRecord): Promise<void> {
    this.spaceMembers.set(member.id, { ...member });
  }

  async updateSpace(spaceId: string, patch: Partial<SpaceRecord>): Promise<void> {
    const current = this.spaces.get(spaceId);
    if (!current) {
      throw new Error(`space not found: ${spaceId}`);
    }
    this.spaces.set(spaceId, { ...current, ...patch });
  }

  async listActiveMembers(spaceId: string): Promise<SpaceMemberRecord[]> {
    return [...this.spaceMembers.values()]
      .filter((member) => member.spaceId === spaceId && member.status === MEMBER_STATUS_ACTIVE)
      .map((member) => ({ ...member }));
  }

  async writeAudit(log: AuditLogRecord): Promise<void> {
    this.audits.push({ ...log });
  }

  async findTodoById(spaceId: string, todoId: string): Promise<TodoRecord | null> {
    const todo = this.todos.get(todoId);
    return todo && todo.spaceId === spaceId ? { ...todo } : null;
  }

  async createTodo(todo: TodoRecord): Promise<void> {
    this.todos.set(todo.id, { ...todo });
  }

  async updateTodo(spaceId: string, todoId: string, patch: Partial<TodoRecord>): Promise<void> {
    const current = this.todos.get(todoId);
    if (!current || current.spaceId !== spaceId) return;
    this.todos.set(todoId, { ...current, ...patch });
  }

  async listTodosByDateRange(
    spaceId: string,
    startDate: string,
    endDate: string,
  ): Promise<TodoRecord[]> {
    return [...this.todos.values()]
      .filter((todo) => todo.spaceId === spaceId && todo.date >= startDate && todo.date <= endDate)
      .map((todo) => ({ ...todo }));
  }

  async findCalendarEventBySource(
    spaceId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<CalendarEventRecord | null> {
    for (const event of this.calendarEvents.values()) {
      if (event.spaceId === spaceId && event.sourceType === sourceType && event.sourceId === sourceId) {
        return { ...event };
      }
    }
    return null;
  }

  async listCalendarEventsByRange(
    spaceId: string,
    start: Date,
    end: Date,
  ): Promise<CalendarEventRecord[]> {
    return [...this.calendarEvents.values()]
      .filter((event) => event.spaceId === spaceId && event.startTime >= start && event.startTime <= end)
      .map((event) => ({ ...event }));
  }

  async createCalendarEvent(event: CalendarEventRecord): Promise<void> {
    this.calendarEvents.set(event.id, { ...event });
  }

  async updateCalendarEvent(
    spaceId: string,
    eventId: string,
    patch: Partial<CalendarEventRecord>,
  ): Promise<void> {
    const current = this.calendarEvents.get(eventId);
    if (!current || current.spaceId !== spaceId) return;
    this.calendarEvents.set(eventId, { ...current, ...patch });
  }

  async deleteCalendarEvent(spaceId: string, eventId: string): Promise<void> {
    const current = this.calendarEvents.get(eventId);
    if (current && current.spaceId === spaceId) {
      this.calendarEvents.delete(eventId);
    }
  }

  async listPeriodRecords(spaceId: string): Promise<PeriodRecordRecord[]> {
    return [...this.periodRecords.values()]
      .filter((record) => record.spaceId === spaceId)
      .map((record) => ({ ...record }));
  }

  async createPeriodRecord(record: PeriodRecordRecord): Promise<void> {
    this.periodRecords.set(record.id, { ...record });
  }

  async deletePeriodRecord(spaceId: string, recordId: string): Promise<void> {
    const current = this.periodRecords.get(recordId);
    if (current && current.spaceId === spaceId) {
      this.periodRecords.delete(recordId);
    }
  }

  async listHolidaysByRange(startDate: string, endDate: string): Promise<HolidayRecord[]> {
    return [...this.holidays.values()]
      .filter((record) => record.date >= startDate && record.date <= endDate)
      .map((record) => ({ ...record }));
  }

  async upsertHoliday(record: HolidayRecord): Promise<void> {
    this.holidays.set(record.id, { ...record });
  }

  async findSpaceSetting(spaceId: string, key: string): Promise<SpaceSettingRecord | null> {
    for (const setting of this.spaceSettings.values()) {
      if (setting.spaceId === spaceId && setting.key === key) {
        return { ...setting };
      }
    }
    return null;
  }

  async upsertSpaceSetting(setting: SpaceSettingRecord): Promise<void> {
    this.spaceSettings.set(setting.id, { ...setting });
  }

  async listMealTemplates(spaceId: string): Promise<MealTemplateRecord[]> {
    return [...this.mealTemplates.values()]
      .filter((t) => t.spaceId === spaceId)
      .map((t) => ({ ...t }));
  }

  async findMealTemplateById(
    spaceId: string,
    templateId: string,
  ): Promise<MealTemplateRecord | null> {
    const t = this.mealTemplates.get(templateId);
    return t && t.spaceId === spaceId ? { ...t } : null;
  }

  async createMealTemplate(template: MealTemplateRecord): Promise<void> {
    this.mealTemplates.set(template.id, { ...template });
  }

  async updateMealTemplate(
    spaceId: string,
    templateId: string,
    patch: Partial<MealTemplateRecord>,
  ): Promise<void> {
    const current = this.mealTemplates.get(templateId);
    if (!current || current.spaceId !== spaceId) return;
    this.mealTemplates.set(templateId, { ...current, ...patch });
  }

  async deleteMealTemplate(spaceId: string, templateId: string): Promise<void> {
    const current = this.mealTemplates.get(templateId);
    if (current && current.spaceId === spaceId) {
      this.mealTemplates.delete(templateId);
    }
  }

  async findMealPlanById(spaceId: string, planId: string): Promise<MealPlanRecord | null> {
    const plan = this.mealPlans.get(planId);
    return plan && plan.spaceId === spaceId ? { ...plan } : null;
  }

  async listMealPlansByDateRange(
    spaceId: string,
    startDate: string,
    endDate: string,
  ): Promise<MealPlanRecord[]> {
    return [...this.mealPlans.values()]
      .filter((p) => p.spaceId === spaceId && p.date >= startDate && p.date <= endDate)
      .map((p) => ({ ...p }));
  }

  async listExpiredMealPlans(now: Date): Promise<MealPlanRecord[]> {
    return [...this.mealPlans.values()]
      .filter((p) => p.expireAt.getTime() <= now.getTime())
      .map((p) => ({ ...p }));
  }

  async createMealPlan(plan: MealPlanRecord): Promise<void> {
    this.mealPlans.set(plan.id, { ...plan });
  }

  async updateMealPlan(spaceId: string, planId: string, patch: Partial<MealPlanRecord>): Promise<void> {
    const current = this.mealPlans.get(planId);
    if (!current || current.spaceId !== spaceId) return;
    this.mealPlans.set(planId, { ...current, ...patch });
  }

  async deleteMealPlan(spaceId: string, planId: string): Promise<void> {
    const current = this.mealPlans.get(planId);
    if (current && current.spaceId === spaceId) {
      this.mealPlans.delete(planId);
    }
  }

  async createTrash(item: TrashRecord): Promise<void> {
    this.trash.set(item.id, { ...item });
  }

  async restoreRecord(collection: string, record: Record<string, unknown>): Promise<void> {
    const id = record.id as string;
    if (collection === 'meal_templates') {
      this.mealTemplates.set(id, record as unknown as MealTemplateRecord);
    } else if (collection === 'meal_plans') {
      this.mealPlans.set(id, record as unknown as MealPlanRecord);
    } else if (collection === 'restaurants') {
      this.restaurants.set(id, record as unknown as RestaurantRecord);
    } else if (collection === 'restaurant_visits') {
      this.restaurantVisits.set(id, record as unknown as RestaurantVisitRecord);
    } else if (collection === 'todos') {
      this.todos.set(id, record as unknown as TodoRecord);
    } else {
      throw new Error(`restoreRecord: unsupported collection ${collection}`);
    }
  }

  async listTrash(spaceId: string, collection?: string): Promise<TrashRecord[]> {
    return [...this.trash.values()]
      .filter(
        (t) =>
          t.spaceId === spaceId &&
          t.status === 'in_trash' &&
          (!collection || t.collection === collection),
      )
      .map((t) => ({ ...t }));
  }

  async findTrashById(spaceId: string, trashId: string): Promise<TrashRecord | null> {
    const t = this.trash.get(trashId);
    return t && t.spaceId === spaceId ? { ...t } : null;
  }

  async updateTrash(spaceId: string, trashId: string, patch: Partial<TrashRecord>): Promise<void> {
    const current = this.trash.get(trashId);
    if (!current || current.spaceId !== spaceId) return;
    this.trash.set(trashId, { ...current, ...patch });
  }

  async deleteTrash(spaceId: string, trashId: string): Promise<void> {
    const current = this.trash.get(trashId);
    if (current && current.spaceId === spaceId) {
      this.trash.delete(trashId);
    }
  }

  async listTrashDueForPurge(now: Date): Promise<TrashRecord[]> {
    return [...this.trash.values()]
      .filter((t) => t.status === 'in_trash' && t.purgeAt.getTime() <= now.getTime())
      .map((t) => ({ ...t }));
  }

  async listRestaurants(spaceId: string): Promise<RestaurantRecord[]> {
    return [...this.restaurants.values()]
      .filter((r) => r.spaceId === spaceId)
      .map((r) => ({ ...r }));
  }

  async findRestaurantById(spaceId: string, restaurantId: string): Promise<RestaurantRecord | null> {
    const r = this.restaurants.get(restaurantId);
    return r && r.spaceId === spaceId ? { ...r } : null;
  }

  async createRestaurant(restaurant: RestaurantRecord): Promise<void> {
    this.restaurants.set(restaurant.id, { ...restaurant });
  }

  async updateRestaurant(
    spaceId: string,
    restaurantId: string,
    patch: Partial<RestaurantRecord>,
  ): Promise<void> {
    const current = this.restaurants.get(restaurantId);
    if (!current || current.spaceId !== spaceId) return;
    this.restaurants.set(restaurantId, { ...current, ...patch });
  }

  async deleteRestaurant(spaceId: string, restaurantId: string): Promise<void> {
    const current = this.restaurants.get(restaurantId);
    if (current && current.spaceId === spaceId) {
      this.restaurants.delete(restaurantId);
    }
  }

  async findRestaurantVisitById(
    spaceId: string,
    visitId: string,
  ): Promise<RestaurantVisitRecord | null> {
    const v = this.restaurantVisits.get(visitId);
    return v && v.spaceId === spaceId ? { ...v } : null;
  }

  async listRestaurantVisitsByDateRange(
    spaceId: string,
    startDate: string,
    endDate: string,
  ): Promise<RestaurantVisitRecord[]> {
    return [...this.restaurantVisits.values()]
      .filter((v) => v.spaceId === spaceId && v.date >= startDate && v.date <= endDate)
      .map((v) => ({ ...v }));
  }

  async listExpiredRestaurantVisits(now: Date): Promise<RestaurantVisitRecord[]> {
    return [...this.restaurantVisits.values()]
      .filter((v) => v.expireAt.getTime() <= now.getTime())
      .map((v) => ({ ...v }));
  }

  async createRestaurantVisit(visit: RestaurantVisitRecord): Promise<void> {
    this.restaurantVisits.set(visit.id, { ...visit });
  }

  async updateRestaurantVisit(
    spaceId: string,
    visitId: string,
    patch: Partial<RestaurantVisitRecord>,
  ): Promise<void> {
    const current = this.restaurantVisits.get(visitId);
    if (!current || current.spaceId !== spaceId) return;
    this.restaurantVisits.set(visitId, { ...current, ...patch });
  }

  async deleteRestaurantVisit(spaceId: string, visitId: string): Promise<void> {
    const current = this.restaurantVisits.get(visitId);
    if (current && current.spaceId === spaceId) {
      this.restaurantVisits.delete(visitId);
    }
  }
}
