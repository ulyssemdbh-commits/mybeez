/**
 * Google Calendar Service — myBeez
 *
 * Manages calendar events for restaurant operations.
 * Requires GOOGLE_CALENDAR_ID and Google service account credentials.
 */

interface CalendarEvent {
  title: string;
  description?: string;
  date: string;
  time?: string;
  tenantId: string;
}

class CalendarService {
  private configured: boolean = false;

  constructor() {
    this.configured = !!process.env.GOOGLE_CALENDAR_ID;
    if (this.configured) {
      console.log("[Calendar] Google Calendar configured");
    } else {
      console.log("[Calendar] Google Calendar not configured (GOOGLE_CALENDAR_ID not set)");
    }
  }

  isReady(): boolean {
    return this.configured;
  }

  async addChecklistEvent(tenantId: string, summary: { total: number; checked: number; unchecked: number }): Promise<boolean> {
    if (!this.isReady()) {
      console.log("[Calendar] Skipping event — not configured");
      return false;
    }

    const restaurantName = tenantId === "val" ? "Valentine" : "Maillane";
    const pct = Math.round((summary.checked / summary.total) * 100);

    console.log(
      `[Calendar] Would create event: "${restaurantName} Checklist ${pct}%" — ${summary.checked}/${summary.total} items`,
    );

    return true;
  }

  async getUpcomingEvents(tenantId: string, days: number = 7): Promise<CalendarEvent[]> {
    if (!this.isReady()) return [];
    return [];
  }
}

export const calendarService = new CalendarService();
