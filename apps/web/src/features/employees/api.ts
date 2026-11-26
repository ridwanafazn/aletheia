import {
  AttendanceListResponseSchema,
  EmployeePageSchema,
  EmployeeSchema,
  LeaveRequestListResponseSchema,
  type AttendanceSummary,
  type Employee,
  type EmployeePage,
  type LeaveRequest,
} from "@aletheia/shared-contracts";

import { apiRequest, toQuery, type ApiResult } from "../../shared/api/client";

export interface EmployeeFilters {
  branch_id?: string | undefined;
  personnel_type?: string | undefined;
  status?: string | undefined;
  active?: string | undefined;
  search?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export function listEmployees(filters: EmployeeFilters = {}): Promise<ApiResult<EmployeePage>> {
  return apiRequest(
    `/api/v1/employees${toQuery({
      branch_id: filters.branch_id,
      personnel_type: filters.personnel_type,
      status: filters.status,
      active: filters.active,
      search: filters.search,
      cursor: filters.cursor,
      limit: filters.limit ?? 25,
    })}`,
    { schema: EmployeePageSchema },
  );
}

export async function listAllEmployees(branchId?: string): Promise<Employee[]> {
  const employees: Employee[] = [];
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const result = await listEmployees({
      ...(branchId === undefined ? {} : { branch_id: branchId }),
      cursor,
      limit: 100,
    });
    employees.push(...result.data.items);
    const next = result.data.meta.next_cursor;
    if (!result.data.meta.has_more || next === null) {
      break;
    }
    cursor = next;
  }
  return employees;
}

export function getEmployee(employeeId: string): Promise<ApiResult<Employee>> {
  return apiRequest(`/api/v1/employees/${employeeId}`, { schema: EmployeeSchema });
}

export function listAttendance(input: {
  personnelId: string;
  period: string;
}): Promise<ApiResult<{ items: AttendanceSummary[] }>> {
  return apiRequest(
    `/api/v1/attendance${toQuery({
      personnel_id: input.personnelId,
      period: input.period,
    })}`,
    { schema: AttendanceListResponseSchema },
  );
}

export function listLeaveRequests(input: {
  personnelId: string;
}): Promise<ApiResult<{ items: LeaveRequest[] }>> {
  return apiRequest(`/api/v1/leave-requests${toQuery({ personnel_id: input.personnelId })}`, {
    schema: LeaveRequestListResponseSchema,
  });
}
