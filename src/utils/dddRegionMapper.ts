// Mapeamento de DDDs brasileiros para estados e cidades principais
const dddMap: Record<string, { state: string; stateCode: string; city: string }> = {
  // São Paulo
  '11': { state: 'São Paulo', stateCode: 'SP', city: 'São Paulo' },
  '12': { state: 'São Paulo', stateCode: 'SP', city: 'São José dos Campos' },
  '13': { state: 'São Paulo', stateCode: 'SP', city: 'Santos' },
  '14': { state: 'São Paulo', stateCode: 'SP', city: 'Bauru' },
  '15': { state: 'São Paulo', stateCode: 'SP', city: 'Sorocaba' },
  '16': { state: 'São Paulo', stateCode: 'SP', city: 'Ribeirão Preto' },
  '17': { state: 'São Paulo', stateCode: 'SP', city: 'São José do Rio Preto' },
  '18': { state: 'São Paulo', stateCode: 'SP', city: 'Presidente Prudente' },
  '19': { state: 'São Paulo', stateCode: 'SP', city: 'Campinas' },
  
  // Rio de Janeiro
  '21': { state: 'Rio de Janeiro', stateCode: 'RJ', city: 'Rio de Janeiro' },
  '22': { state: 'Rio de Janeiro', stateCode: 'RJ', city: 'Campos dos Goytacazes' },
  '24': { state: 'Rio de Janeiro', stateCode: 'RJ', city: 'Petrópolis' },
  
  // Espírito Santo
  '27': { state: 'Espírito Santo', stateCode: 'ES', city: 'Vitória' },
  '28': { state: 'Espírito Santo', stateCode: 'ES', city: 'Cachoeiro de Itapemirim' },
  
  // Minas Gerais
  '31': { state: 'Minas Gerais', stateCode: 'MG', city: 'Belo Horizonte' },
  '32': { state: 'Minas Gerais', stateCode: 'MG', city: 'Juiz de Fora' },
  '33': { state: 'Minas Gerais', stateCode: 'MG', city: 'Governador Valadares' },
  '34': { state: 'Minas Gerais', stateCode: 'MG', city: 'Uberlândia' },
  '35': { state: 'Minas Gerais', stateCode: 'MG', city: 'Poços de Caldas' },
  '37': { state: 'Minas Gerais', stateCode: 'MG', city: 'Divinópolis' },
  '38': { state: 'Minas Gerais', stateCode: 'MG', city: 'Montes Claros' },
  
  // Paraná
  '41': { state: 'Paraná', stateCode: 'PR', city: 'Curitiba' },
  '42': { state: 'Paraná', stateCode: 'PR', city: 'Ponta Grossa' },
  '43': { state: 'Paraná', stateCode: 'PR', city: 'Londrina' },
  '44': { state: 'Paraná', stateCode: 'PR', city: 'Maringá' },
  '45': { state: 'Paraná', stateCode: 'PR', city: 'Cascavel' },
  '46': { state: 'Paraná', stateCode: 'PR', city: 'Francisco Beltrão' },
  
  // Santa Catarina
  '47': { state: 'Santa Catarina', stateCode: 'SC', city: 'Joinville' },
  '48': { state: 'Santa Catarina', stateCode: 'SC', city: 'Florianópolis' },
  '49': { state: 'Santa Catarina', stateCode: 'SC', city: 'Chapecó' },
  
  // Rio Grande do Sul
  '51': { state: 'Rio Grande do Sul', stateCode: 'RS', city: 'Porto Alegre' },
  '53': { state: 'Rio Grande do Sul', stateCode: 'RS', city: 'Pelotas' },
  '54': { state: 'Rio Grande do Sul', stateCode: 'RS', city: 'Caxias do Sul' },
  '55': { state: 'Rio Grande do Sul', stateCode: 'RS', city: 'Santa Maria' },
  
  // Distrito Federal
  '61': { state: 'Distrito Federal', stateCode: 'DF', city: 'Brasília' },
  
  // Goiás
  '62': { state: 'Goiás', stateCode: 'GO', city: 'Goiânia' },
  '64': { state: 'Goiás', stateCode: 'GO', city: 'Rio Verde' },
  
  // Tocantins
  '63': { state: 'Tocantins', stateCode: 'TO', city: 'Palmas' },
  
  // Mato Grosso
  '65': { state: 'Mato Grosso', stateCode: 'MT', city: 'Cuiabá' },
  '66': { state: 'Mato Grosso', stateCode: 'MT', city: 'Rondonópolis' },
  
  // Mato Grosso do Sul
  '67': { state: 'Mato Grosso do Sul', stateCode: 'MS', city: 'Campo Grande' },
  
  // Acre
  '68': { state: 'Acre', stateCode: 'AC', city: 'Rio Branco' },
  
  // Rondônia
  '69': { state: 'Rondônia', stateCode: 'RO', city: 'Porto Velho' },
  
  // Bahia
  '71': { state: 'Bahia', stateCode: 'BA', city: 'Salvador' },
  '73': { state: 'Bahia', stateCode: 'BA', city: 'Ilhéus' },
  '74': { state: 'Bahia', stateCode: 'BA', city: 'Juazeiro' },
  '75': { state: 'Bahia', stateCode: 'BA', city: 'Feira de Santana' },
  '77': { state: 'Bahia', stateCode: 'BA', city: 'Vitória da Conquista' },
  
  // Sergipe
  '79': { state: 'Sergipe', stateCode: 'SE', city: 'Aracaju' },
  
  // Pernambuco
  '81': { state: 'Pernambuco', stateCode: 'PE', city: 'Recife' },
  '87': { state: 'Pernambuco', stateCode: 'PE', city: 'Petrolina' },
  
  // Alagoas
  '82': { state: 'Alagoas', stateCode: 'AL', city: 'Maceió' },
  
  // Paraíba
  '83': { state: 'Paraíba', stateCode: 'PB', city: 'João Pessoa' },
  
  // Rio Grande do Norte
  '84': { state: 'Rio Grande do Norte', stateCode: 'RN', city: 'Natal' },
  
  // Ceará
  '85': { state: 'Ceará', stateCode: 'CE', city: 'Fortaleza' },
  '88': { state: 'Ceará', stateCode: 'CE', city: 'Juazeiro do Norte' },
  
  // Piauí
  '86': { state: 'Piauí', stateCode: 'PI', city: 'Teresina' },
  '89': { state: 'Piauí', stateCode: 'PI', city: 'Picos' },
  
  // Maranhão
  '98': { state: 'Maranhão', stateCode: 'MA', city: 'São Luís' },
  '99': { state: 'Maranhão', stateCode: 'MA', city: 'Imperatriz' },
  
  // Pará
  '91': { state: 'Pará', stateCode: 'PA', city: 'Belém' },
  '93': { state: 'Pará', stateCode: 'PA', city: 'Santarém' },
  '94': { state: 'Pará', stateCode: 'PA', city: 'Marabá' },
  
  // Amazonas
  '92': { state: 'Amazonas', stateCode: 'AM', city: 'Manaus' },
  '97': { state: 'Amazonas', stateCode: 'AM', city: 'Parintins' },
  
  // Roraima
  '95': { state: 'Roraima', stateCode: 'RR', city: 'Boa Vista' },
  
  // Amapá
  '96': { state: 'Amapá', stateCode: 'AP', city: 'Macapá' },
};

export interface RegionInfo {
  ddd: string;
  state: string;
  stateCode: string;
  city: string;
}

/**
 * Extrai o DDD de um número de telefone brasileiro e retorna informações da região
 * @param phoneNumber - Número de telefone (pode incluir código do país 55)
 * @returns RegionInfo ou null se não encontrar
 */
export function getRegionFromPhone(phoneNumber: string): RegionInfo | null {
  if (!phoneNumber) return null;
  
  // Remove tudo que não é número
  const digits = phoneNumber.replace(/\D/g, '');
  
  if (digits.length < 10) return null;
  
  let ddd: string;
  
  // Se começa com 55 (código do Brasil), pula os primeiros 2 dígitos
  if (digits.startsWith('55') && digits.length >= 12) {
    ddd = digits.substring(2, 4);
  } else if (digits.length >= 10) {
    // Caso contrário, assume que os 2 primeiros são o DDD
    ddd = digits.substring(0, 2);
  } else {
    return null;
  }
  
  const regionData = dddMap[ddd];
  
  if (!regionData) return null;
  
  return {
    ddd,
    ...regionData
  };
}

/**
 * Formata a informação de região para exibição
 * @param phoneNumber - Número de telefone
 * @returns String formatada "Cidade - UF" ou null
 */
export function formatRegionFromPhone(phoneNumber: string): string | null {
  const region = getRegionFromPhone(phoneNumber);
  if (!region) return null;
  return `${region.city} - ${region.stateCode}`;
}
