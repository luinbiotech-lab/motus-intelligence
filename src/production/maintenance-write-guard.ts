export function assertMaintenanceWriteAllowed(command:string):void {
  if(process.env.MOTUS_MAINTENANCE_WRITE_ENABLED!=='true'||!process.env.MOTUS_MAINTENANCE_REASON?.trim()){
    throw new Error(`${command} is a maintenance-only write path; set MOTUS_MAINTENANCE_WRITE_ENABLED=true and MOTUS_MAINTENANCE_REASON after explicit operator review`);
  }
  if(process.env.GITHUB_ACTIONS==='true')throw new Error(`${command} is blocked in scheduled automation`);
}
