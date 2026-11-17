import type { FastifyInstance } from 'fastify';
import type { ApiRuntime } from '../../runtime.js';
import { idParams, emptyQuery, emptyActionBody } from '../../http-errors.js';
export function placeAgentRoutes(app:FastifyInstance,runtime:ApiRuntime):void {
  app.post<{Params:{id:string}}>('/items/:id/enrich',{preValidation:emptyActionBody,schema:{params:idParams,querystring:emptyQuery}},(request,reply)=>{
    const job=runtime.placeAgent.start(Number(request.params.id));
    return reply.code(job.status==='completed'?200:202).send({...runtime.events.stamp(),job});
  });
}
