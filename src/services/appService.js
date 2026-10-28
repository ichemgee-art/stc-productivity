import { attendanceService } from './attendanceService'
import { catalogService } from './catalogService'
import { peopleService } from './peopleService'
import { productivityService } from './productivityService'
import { projectProgressService } from './projectProgressService'
import { systemService } from './systemService'
import { userAdminService } from './userAdminService'

// Compatibility facade: existing pages can keep importing appService while
// domain logic stays split into focused services.
export const appService = {
  ...systemService,
  ...userAdminService,
  ...productivityService,
  ...peopleService,
  ...attendanceService,
  ...catalogService,
  ...projectProgressService,
}

export {
  attendanceService,
  catalogService,
  peopleService,
  productivityService,
  projectProgressService,
  systemService,
  userAdminService,
}
