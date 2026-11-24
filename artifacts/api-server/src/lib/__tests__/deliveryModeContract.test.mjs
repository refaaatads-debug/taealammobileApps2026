import assert from 'node:assert/strict';
import test from 'node:test';
import { GetStudentDashboardResponse, GetTeacherDashboardResponse, ListMySessionsResponse, ListMySessionsResponseItem, CancelSessionResponse } from '../../../../../lib/api-zod/src/generated/api.ts';
const session={id:'synthetic-session',title:'حصة تجريبية',subject:'رياضيات',person:'مستخدم تجريبي',date:'2035-04-01',time:'13:00',scheduledAt:'2035-04-01T10:00:00Z',duration:'60',tone:'teal',status:'upcoming',sessionStatus:'not_started'};
const student={profileComplete:true,missingProfileFields:[],stats:{completedSessions:0,cancelledSessions:0,progress:0,points:0},balance:null,openBookingRequests:0,unreadNotifications:0,upcomingSessions:[],degradedSections:[]};
const teacher={teacherApproved:true,stats:{earnings:0,students:0,sessions:0,rating:0},openRequests:0,unreadNotifications:0,warningCount:0,upcomingSessions:[],degradedSections:[]};
test('all four session response contracts preserve delivery mode and accept old payloads',()=>{
 for(const mode of ['online','in_person']){
 const s={...session,deliveryMode:mode};
 assert.equal(ListMySessionsResponseItem.parse(s).deliveryMode,mode);
 assert.equal(ListMySessionsResponse.parse([s])[0].deliveryMode,mode);
 assert.equal(CancelSessionResponse.parse(s).deliveryMode,mode);
 assert.equal(GetStudentDashboardResponse.parse({...student,upcomingSessions:[s]}).upcomingSessions[0].deliveryMode,mode);
 assert.equal(GetTeacherDashboardResponse.parse({...teacher,upcomingSessions:[s]}).upcomingSessions[0].deliveryMode,mode);
 }
 assert.equal(ListMySessionsResponseItem.parse(session).deliveryMode,undefined);
 assert.equal(ListMySessionsResponseItem.safeParse({...session,deliveryMode:'invalid'}).success,false);
});
