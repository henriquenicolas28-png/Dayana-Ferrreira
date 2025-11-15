import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (req: Request, context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ message: 'Método não permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const store = getStore('empresas');
    const { blobs } = await store.list({ prefix: 'empresa-' });

    const empresas = [];
    
    for (const blob of blobs) {
      const empresa = await store.get(blob.key, { type: 'json' });
      if (empresa && empresa.status === 'aprovado') {
        empresas.push(empresa);
      }
    }

    return new Response(JSON.stringify({ empresas }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      }
    });

  } catch (error) {
    console.error('Erro ao listar empresas:', error);
    return new Response(JSON.stringify({ 
      message: 'Erro ao carregar empresas',
      empresas: []
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
