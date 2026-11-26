import { pool } from "@aletheia/database";
import {
  OrganizationTreeSchema,
  type OrganizationPerson,
  type OrganizationPosition,
} from "@aletheia/shared-contracts";
import { Router, type Router as RouterType } from "express";

import { sendData } from "../lib/response.js";
import { requireTenantFeature } from "../lib/tenant-plan.js";
import { requireRoles } from "../middleware/authorize.js";

interface DepartmentRow {
  id: string;
  code: string;
  name: string;
}

interface PositionRow {
  id: string;
  code: string;
  name: string;
  job_level: string;
}

interface PersonnelRow {
  personnel_id: string;
  department_id: string | null;
  position_id: string | null;
  personnel_code: string;
  full_name: string;
  personnel_type: string;
  employment_status: string;
  supervisor_id: string | null;
}

function toPerson(row: PersonnelRow): OrganizationPerson {
  return {
    personnel_id: row.personnel_id,
    personnel_code: row.personnel_code,
    full_name: row.full_name,
    personnel_type: row.personnel_type as OrganizationPerson["personnel_type"],
    employment_status: row.employment_status as OrganizationPerson["employment_status"],
    supervisor_id: row.supervisor_id,
  };
}

export const organizationRouter: RouterType = Router();

organizationRouter.use(requireTenantFeature("ORGANIZATION"));

organizationRouter.get(
  "/",
  requireRoles(
    "HR_SPECIALIST",
    "BRANCH_MANAGER",
    "FINANCE_MANAGER",
    "COMPLIANCE_ADMIN",
    "MIS_ANALYST",
  ),
  async (request, response) => {
    const auth = request.auth!;
    const [departments, positions, personnel] = await Promise.all([
      pool.query<DepartmentRow>(
        `select id, code, name from governance.departments
          where tenant_id = $1 order by code asc`,
        [auth.tenantId],
      ),
      pool.query<PositionRow>(
        `select id, code, name, job_level from governance.positions
          where tenant_id = $1 order by job_level asc, code asc`,
        [auth.tenantId],
      ),
      pool.query<PersonnelRow>(
        `select id as personnel_id, department_id, position_id, personnel_code, full_name,
                personnel_type, employment_status, supervisor_id
           from payroll.personnel
          where tenant_id = $1 and is_active = true
            and personnel_code not like 'LOAD-%'
            and ($2::uuid is null or branch_id = $2)
          order by full_name asc`,
        [auth.tenantId, auth.role === "BRANCH_MANAGER" ? auth.branchId : null],
      ),
    ]);

    const peopleByDepartment = new Map<string, Map<string, OrganizationPerson[]>>();
    const unassigned: OrganizationPerson[] = [];
    for (const row of personnel.rows) {
      const person = toPerson(row);
      if (row.department_id === null || row.position_id === null) {
        unassigned.push(person);
        continue;
      }
      const byPosition = peopleByDepartment.get(row.department_id) ?? new Map();
      const list = byPosition.get(row.position_id) ?? [];
      list.push(person);
      byPosition.set(row.position_id, list);
      peopleByDepartment.set(row.department_id, byPosition);
    }

    const tree = departments.rows.map((department) => {
      const byPosition = peopleByDepartment.get(department.id) ?? new Map();
      const departmentPositions: OrganizationPosition[] = positions.rows
        .map((position) => {
          const people = byPosition.get(position.id) ?? [];
          return {
            id: position.id,
            code: position.code,
            name: position.name,
            job_level: position.job_level as OrganizationPosition["job_level"],
            headcount: people.length,
            personnel: people,
          };
        })
        .filter((position) => position.headcount > 0);
      return {
        id: department.id,
        code: department.code,
        name: department.name,
        headcount: departmentPositions.reduce((total, position) => total + position.headcount, 0),
        positions: departmentPositions,
      };
    });

    sendData(
      response,
      OrganizationTreeSchema.parse({
        departments: tree,
        unassigned,
      }),
    );
  },
);
