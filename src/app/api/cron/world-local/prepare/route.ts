import { handleWorldLocal } from "../handler";
export const runtime="nodejs";
export const maxDuration=300;
export const dynamic="force-dynamic";
export async function GET(req:Request){return handleWorldLocal(req,"prepare");}
