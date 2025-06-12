import {
  CloudTrailClient,
  LookupEventsCommand,
  LookupAttribute,
  Event,
} from '@aws-sdk/client-cloudtrail';
import { DashboardUsageMetrics } from '../types';
import { logger } from '../utils/logger';
import { subDays, isAfter, startOfDay } from 'date-fns';

export class MetricsService {
  private cloudTrailClient: CloudTrailClient;

  constructor() {
    this.cloudTrailClient = new CloudTrailClient({});
  }

  async getDashboardUsage(dashboardArn: string): Promise<DashboardUsageMetrics> {
    const now = new Date();
    const thirtyDaysAgo = subDays(now, 30);
    const sevenDaysAgo = subDays(now, 7);
    const today = startOfDay(now);

    try {
      const events = await this.fetchCloudTrailEvents(dashboardArn, thirtyDaysAgo, now);
      
      const viewEvents = events.filter(event => 
        event.EventName === 'GenerateEmbedUrlForRegisteredUser' ||
        event.EventName === 'GenerateEmbedUrlForAnonymousUser' ||
        event.EventName === 'GetDashboard' ||
        event.EventName === 'DescribeDashboard'
      );

      const viewCountLast30Days = viewEvents.length;
      const viewCountLast7Days = viewEvents.filter(event => 
        event.EventTime && isAfter(event.EventTime, sevenDaysAgo)
      ).length;
      const viewCountToday = viewEvents.filter(event => 
        event.EventTime && isAfter(event.EventTime, today)
      ).length;

      const lastViewed = viewEvents.length > 0 && viewEvents[0].EventTime 
        ? viewEvents[0].EventTime.toISOString() 
        : undefined;

      // Calculate top viewers
      const viewerCounts = new Map<string, number>();
      viewEvents.forEach(event => {
        const username = (event as any).UserIdentity?.userName || 'Anonymous';
        viewerCounts.set(username, (viewerCounts.get(username) || 0) + 1);
      });

      const topViewers = Array.from(viewerCounts.entries())
        .map(([user, viewCount]) => ({ user, viewCount }))
        .sort((a, b) => b.viewCount - a.viewCount)
        .slice(0, 5);

      return {
        viewCountLast30Days,
        viewCountLast7Days,
        viewCountToday,
        lastViewed,
        topViewers,
      };
    } catch (error) {
      logger.error(`Error fetching usage metrics for ${dashboardArn}:`, error);
      return {
        viewCountLast30Days: 0,
        viewCountLast7Days: 0,
        viewCountToday: 0,
      };
    }
  }

  private async fetchCloudTrailEvents(
    dashboardArn: string,
    startTime: Date,
    endTime: Date
  ): Promise<Event[]> {
    const events: Event[] = [];
    let nextToken: string | undefined;

    const lookupAttributes: LookupAttribute[] = [
      {
        AttributeKey: 'ResourceName',
        AttributeValue: dashboardArn,
      },
    ];

    do {
      try {
        const command = new LookupEventsCommand({
          LookupAttributes: lookupAttributes,
          StartTime: startTime,
          EndTime: endTime,
          NextToken: nextToken,
          MaxResults: 50,
        });

        const response = await this.cloudTrailClient.send(command);

        if (response.Events) {
          events.push(...response.Events);
        }

        nextToken = response.NextToken;
      } catch (error) {
        logger.error('Error fetching CloudTrail events:', error);
        break;
      }
    } while (nextToken);

    // Sort events by time, most recent first
    return events.sort((a, b) => {
      const timeA = a.EventTime?.getTime() || 0;
      const timeB = b.EventTime?.getTime() || 0;
      return timeB - timeA;
    });
  }
}