import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

interface EmpresaData {
  cnpj: string;
  nomeEmpresa: string;
  nomeFantasia: string;
  setor: string;
  descricao: string;
  endereco: string;
  cidade: string;
  estado: string;
  telefone: string;
  celular?: string;
  email: string;
  website?: string;
  dataCadastro: string;
  status: string;
}

function validarCNPJ(cnpj: string): boolean {
  cnpj = cnpj.replace(/\D/g, '');
  
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;

  let tamanho = cnpj.length - 2;
  let numeros = cnpj.substring(0, tamanho);
  let digitos = cnpj.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += Number(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
  if (resultado !== Number(digitos.charAt(0))) return false;

  tamanho = tamanho + 1;
  numeros = cnpj.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += Number(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
  if (resultado !== Number(digitos.charAt(1))) return false;

  return true;
}

async function validarCNPJReceitaFederal(cnpj: string): Promise<{ valido: boolean; dados?: any }> {
  try {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);
    
    if (response.ok) {
      const dados = await response.json();
      return { 
        valido: true, 
        dados: {
          razaoSocial: dados.razao_social,
          nomeFantasia: dados.nome_fantasia,
          situacao: dados.descricao_situacao_cadastral,
          endereco: `${dados.logradouro}, ${dados.numero} - ${dados.bairro}`,
          cidade: dados.municipio,
          estado: dados.uf
        }
      };
    }
    
    return { valido: false };
  } catch (error) {
    console.error('Erro ao validar CNPJ na API:', error);
    return { valido: false };
  }
}

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Método não permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await req.json();
    const { cnpj, nomeEmpresa, email } = data;

    if (!cnpj || !nomeEmpresa || !email) {
      return new Response(JSON.stringify({ 
        message: 'Campos obrigatórios não preenchidos' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!validarCNPJ(cnpj)) {
      return new Response(JSON.stringify({ 
        message: 'CNPJ inválido' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const validacaoReceita = await validarCNPJReceitaFederal(cnpj);
    
    if (!validacaoReceita.valido) {
      return new Response(JSON.stringify({ 
        message: 'CNPJ não encontrado na Receita Federal. Verifique se o número está correto.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const store = getStore('empresas');
    
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    const empresaExistente = await store.get(`empresa-${cnpjLimpo}`, { type: 'json' });
    
    if (empresaExistente) {
      return new Response(JSON.stringify({ 
        message: 'Esta empresa já está cadastrada' 
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const empresaData: EmpresaData = {
      ...data,
      cnpj: cnpjLimpo,
      status: 'pendente',
      dataCadastro: new Date().toISOString(),
      dadosReceita: validacaoReceita.dados
    };

    await store.setJSON(`empresa-${cnpjLimpo}`, empresaData);

    return new Response(JSON.stringify({ 
      message: 'Empresa cadastrada com sucesso! Seu cadastro será revisado em breve.',
      empresa: empresaData
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Erro ao processar cadastro:', error);
    return new Response(JSON.stringify({ 
      message: 'Erro ao processar cadastro. Tente novamente.' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
