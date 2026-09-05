export interface CaseReportItem {
  id: string;
  category: string;
  name: string;
  dailyData: {
    [day: number]: { bh: number | string; nd: number | string };
  };
}
