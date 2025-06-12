const qrcode = require('qrcode-terminal');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// === 1) Configura o cliente com sessão persistida em .wwebjs_auth/gabriela-session ===
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'gabriela-session',
    dataPath: './.wwebjs_auth'
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

const conversas = {};

// === 2) Função corrigida para enviar com delay e capturar erros ===
async function responderComDelay(chatId, mensagem, tempo = 3000) {
  try {
    await client.sendPresenceAvailable();
    const chat = await client.getChatById(chatId);
    if (chat) await chat.sendStateTyping();
    // espera o delay antes de enviar
    await new Promise(resolve => setTimeout(resolve, tempo));
    await client.sendMessage(chatId, mensagem);
  } catch (e) {
    console.error("Erro ao enviar mensagem com delay:", e.message);
  }
}

// === 3) QR code / ready ===
client.on('qr', qr => {
  console.log("🔄 Escaneie o QR code abaixo para conectar:");
  qrcode.generate(qr, { small: true });
});
client.on('ready', () => console.log('✅ WhatsApp conectado com sucesso!'));
client.initialize();

// === 4) Lógica de atendimento via WhatsApp ===
client.on('message', async msg => {
  const agora = Math.floor(Date.now()/1000);
  if (agora - msg.timestamp > 10) return; // ignora mensagens antigas

  const contato = await msg.getContact();
  const nome    = contato.pushname || "cliente";
  const telefone= msg.from;
  const texto   = msg.body.toLowerCase().trim();

  if (!conversas[telefone]) conversas[telefone] = { etapa: 0 };
  const etapa = conversas[telefone].etapa;
  const ignorar = ["ok","tudo bem","obrigado","valeu","👍","👏"];
  if (etapa === 0 && ignorar.includes(texto)) return;

  if (etapa === 0 && ["oi","bom dia","boa tarde","boa noite"].includes(texto)) {
    await responderComDelay(telefone,
      `✨ Olá, ${nome}! Que alegria te receber!\n` +
      `Sou *Gabriela Lima*, da Áureo Express. Como posso ajudar?\n\n` +
      `1️⃣ Novo pedido\n2️⃣ Acompanhar\n3️⃣ Dúvidas`
    );
    conversas[telefone].etapa = 1;
    return;
  }

  switch (etapa) {
    case 1:
      if (texto === "1") {
        conversas[telefone].abandonar = true;
        await responderComDelay(telefone, `*Gabriela Lima*\nQual produto deseja?`);
        conversas[telefone].etapa = 2;
      } else if (texto === "2") {
        await responderComDelay(telefone, `*Gabriela Lima*\nMe informe seu nome completo.`);
        conversas[telefone].etapa = 10;
      } else if (texto === "3") {
        await responderComDelay(telefone, `*Gabriela Lima*\nEstou aqui para tirar suas dúvidas 😉`);
        conversas[telefone].etapa = 20;
      } else {
        await responderComDelay(telefone, `*Gabriela Lima*\nPor favor, digite 1, 2 ou 3.`);
      }
      break;

    case 2:
      conversas[telefone].produto = texto;
      await responderComDelay(telefone,
        `*Gabriela Lima*\nAnotado: *${texto}*.\n` +
        `Agora envie seu endereço completo com CEP.`
      );
      conversas[telefone].etapa = 3;
      break;

    case 3:
      conversas[telefone].endereco = texto;
      await responderComDelay(telefone,
        `*Gabriela Lima*\nEndereço recebido! Frete Grátis até amanhã! ✅\n` +
        `1️⃣ Pix\n2️⃣ Cartão`
      );
      conversas[telefone].etapa = 4;
      break;

    case 4:
      if (texto === "1") {
        await responderComDelay(telefone,
          `*Gabriela Lima*\n🔑 Chave Pix: *CNPJ 59800036000100*\n💵 Valor: *R$129,00*`
        );
      } else if (texto === "2") {
        await responderComDelay(telefone,
          `*Gabriela Lima*\n🔗 Link cartão:\nhttps://aureo-express.pay.yampi.com.br/r/O839CRL949`
        );
      } else {
        await responderComDelay(telefone, `*Gabriela Lima*\nDigite 1 (Pix) ou 2 (Cartão).`);
        return;
      }
      conversas[telefone].etapa = 5;
      if (conversas[telefone].abandonar) {
        setTimeout(() => {
          client.sendMessage(telefone,
            `*Gabriela Lima*\nConseguiu pagar? Se precisar, me avise!`
          );
        }, 10 * 60 * 1000);
      }
      break;

    case 5:
      await responderComDelay(telefone,
        `*Gabriela Lima*\nPedido confirmado e em preparo! 📦`
      );
      conversas[telefone].etapa = 0;
      conversas[telefone].abandonar = false;
      break;

    case 10:
      const nomeCliente = texto;
      await responderComDelay(telefone, `*Gabriela Lima*\nAguarde, verificando... 🔎`);
      setTimeout(() => {
        client.sendMessage(telefone, `*Gabriela Lima*\nSeu pedido está em trânsito! 🚚`);
      }, 5000);
      conversas[telefone].etapa = 0;
      break;

    case 20:
      await responderComDelay(telefone, `*Gabriela Lima*\nUm atendente entrará em contato 😉`);
      conversas[telefone].etapa = 0;
      break;
  }
});

// === 5) Webhook Yampi — responde 200 e envia Pix/Boleto ===
app.post('/webhook-yampi', async (req, res) => {
  const secret = req.headers['x-yampi-webhook-secret'];
  const CHAVE  = "wh_Wyz0t8ddRjjoiWcQa2KLmjtcZTahe1SpvxxpQ";

  console.log("🔔 Webhook headers:", req.headers);
  console.log("🔔 Webhook body:",   req.body);

  if (secret !== CHAVE) {
    console.log("❌ Webhook rejeitado: chave inválida", secret);
    return res.sendStatus(401);
  }
  // confirma recebimento ao Yampi
  res.sendStatus(200);

  const { customer, payment } = req.body;
  const nome     = customer?.name;
  const telefone = customer?.phone;
  if (!nome || !telefone) return;

  const pagamentos = Array.isArray(payment) ? payment : [payment];
  let mensagem = `*Gabriela Lima*\nOi, ${nome}! Recebemos seu pedido!`;

  pagamentos.forEach(p => {
    if (p.method === "pix" && p.pix?.code) {
      mensagem += `\n\n💰 Pix:\n\`\`\`${p.pix.code}\`\`\``;
    } else if (p.method === "boleto" && p.boleto?.barcode) {
      mensagem += `\n\n📄 Boleto:\n\`\`\`${p.boleto.barcode}\`\`\`` +
                   (p.boleto.link ? `\n🔗 ${p.boleto.link}` : "");
    }
  });

  const chatId = `${telefone.replace(/\D/g,'')}@c.us`;
  try {
    const ok = await client.isRegisteredUser(chatId);
    if (!ok) throw new Error("Número não registrado no WhatsApp");
    await responderComDelay(chatId, mensagem, 500);
    console.log("✅ Pedido enviado para:", chatId);
  } catch (err) {
    console.error("❌ Falha ao enviar pedido:", err.message);
  }
});

// === 6) Inicia o servidor ===
app.listen(PORT, () => {
  console.log(`🚀 Servidor online na porta ${PORT}`);
});
