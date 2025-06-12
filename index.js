const qrcode = require('qrcode-terminal');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// 1) Persistir sessão em .wwebjs_auth/gabriela-session
const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'gabriela-session' }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox','--disable-setuid-sandbox']
    }
});

const conversas = {};

// utilitário para enviar com digitação e delay
async function responderComDelay(chatId, mensagem, tempo = 3000) {
    try {
        await client.sendPresenceAvailable();
        const chat = await client.getChatById(chatId);
        if (chat) await chat.sendStateTyping();
        setTimeout(async () => {
            await client.sendMessage(chatId, mensagem);
        }, tempo);
    } catch (e) {
        console.error("Erro ao enviar mensagem com delay:", e.message);
    }
}

// 2) QR code e ready
client.on('qr', qr => {
    console.log("🔄 Escaneie o QR code abaixo para conectar:");
    qrcode.generate(qr, { small: true });
});
client.on('ready', () => console.log('✅ WhatsApp conectado com sucesso!'));
client.initialize();

// 3) Atendimento normal
client.on('message', async msg => {
    const agora = Math.floor(Date.now()/1000);
    if (agora - msg.timestamp > 10) return; // ignora velhas

    const contato = await msg.getContact();
    const nome = contato.pushname || "cliente";
    const telefone = msg.from;
    const texto = msg.body.toLowerCase().trim();

    if (!conversas[telefone]) conversas[telefone] = { etapa:0 };
    const etapa = conversas[telefone].etapa;
    const ignorar = ["ok","tudo bem","obrigado","valeu","👍","👏"];
    if (etapa===0 && ignorar.includes(texto)) return;

    if (etapa===0 && ["oi","bom dia","boa tarde","boa noite"].includes(texto)) {
        await responderComDelay(telefone,
            `✨ Olá, ${nome}! Que alegria te receber por aqui!\n` +
            `Sou *Gabriela Lima*, sua assistente na Áureo Express.\n` +
            `Estou pronta para te ajudar com carinho e rapidez 💛\n\n` +
            `O que deseja hoje?\n1️⃣ Fazer um novo pedido\n2️⃣ Acompanhar pedido\n3️⃣ Tenho dúvidas`
        );
        conversas[telefone].etapa = 1;
        return;
    }

    switch (etapa) {
        case 1:
            if (texto==="1") {
                conversas[telefone].abandonar = true;
                await responderComDelay(telefone,
                    `*Gabriela Lima*\nÓtimo! Qual produto você deseja adquirir?`
                );
                conversas[telefone].etapa = 2;
            } else if (texto==="2") {
                await responderComDelay(telefone,
                    `*Gabriela Lima*\nClaro! Me informe seu *nome completo* para localizar o pedido.`
                );
                conversas[telefone].etapa = 10;
            } else if (texto==="3") {
                await responderComDelay(telefone,
                    `*Gabriela Lima*\n✨ Pode me perguntar o que quiser, ${nome}.\n` +
                    `Estou aqui para tirar suas dúvidas com carinho e agilidade 🤗`
                );
                conversas[telefone].etapa = 20;
            } else {
                await responderComDelay(telefone,
                    `*Gabriela Lima*\nDigite apenas *1*, *2* ou *3* para que eu possa continuar 💛`
                );
            }
            break;

        case 2:
            conversas[telefone].produto = texto;
            await responderComDelay(telefone,
                `*Gabriela Lima*\nPerfeito, ${nome}! 😍\nAnotei seu interesse em: *${texto}*.\n` +
                `Agora, me envie seu *endereço completo com CEP* para calcularmos o envio 📓🚚`
            );
            conversas[telefone].etapa = 3;
            break;

        case 3:
            conversas[telefone].endereco = texto;
            await responderComDelay(telefone,
                `*Gabriela Lima*\nEndereço recebido! Frete Grátis só até amanhã! ✅\n` +
                `Como deseja pagar?\n1️⃣ Pix\n2️⃣ Cartão`
            );
            conversas[telefone].etapa = 4;
            break;

        case 4:
            if (texto==="1") {
                await responderComDelay(telefone,
                    `*Gabriela Lima*\n🔑 Chave Pix: *CNPJ 59800036000100*\n💵 Valor: *R$129,00*`
                );
            } else if (texto==="2") {
                await responderComDelay(telefone,
                    `*Gabriela Lima*\n🔗 Link para pagar com cartão:\n`+
                    `https://aureo-express.pay.yampi.com.br/r/O839CRL949`
                );
            } else {
                await responderComDelay(telefone,
                    `*Gabriela Lima*\nEscolha *1* para Pix ou *2* para Cartão.`
                );
                return;
            }
            conversas[telefone].etapa = 5;
            if (conversas[telefone].abandonar) {
                setTimeout(() => {
                    client.sendMessage(telefone,
                        `*Gabriela Lima*\nOi, ${nome}, conseguiu pagar? Se precisar, estou aqui!`
                    );
                }, 10*60*1000);
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
            conversas[telefone].nomeCliente = texto;
            await responderComDelay(telefone, `*Gabriela Lima*\nVerificando... aguarde 🔎`);
            setTimeout(() => {
                client.sendMessage(telefone,
                    `*Gabriela Lima*\nSeu pedido está *em trânsito*! 🚚`
                );
            }, 5000);
            conversas[telefone].etapa = 0;
            break;

        case 20:
            await responderComDelay(telefone,
                `*Gabriela Lima*\nObrigada pela dúvida! Um atendente vai verificar 😉`
            );
            conversas[telefone].etapa = 0;
            break;

        default:
            await responderComDelay(telefone,
                `*Gabriela Lima*\nOps! Não entendi 😅. Digite *oi* para recomeçar 💛`
            );
            conversas[telefone].etapa = 0;
    }
});

// 4) Webhook Yampi — responde 200 antes de enviar
app.post('/webhook-yampi', async (req, res) => {
    const secret = req.headers['x-yampi-webhook-secret'];
    const CHAVE = "wh_Wyz0t8ddRjjoiWcQa2KLmjtcZTahe1SpvxxpQ";
    console.log("🔔 Webhook headers:", req.headers);
    console.log("🔔 Webhook body:", req.body);

    if (secret !== CHAVE) {
        console.log("❌ Webhook rejeitado: chave inválida", secret);
        return res.sendStatus(401);
    }
    // ACK rápido
    res.sendStatus(200);

    const { customer, payment } = req.body;
    const nome = customer?.name;
    const telefone = customer?.phone;
    if (!nome || !telefone) return;

    const pagamentos = Array.isArray(payment) ? payment : [payment];
    let mensagem = `*Gabriela Lima*\nOi, ${nome}! 😍 Recebemos seu pedido!`;

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
        if (!ok) throw new Error("não registrado");
        await responderComDelay(chatId, mensagem, 500);
        console.log("✅ Pedido enviado para:", chatId);
    } catch (err) {
        console.error("❌ Falha ao enviar pedido:", err.message);
    }
});

// 5) Inicia o servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor online na porta ${PORT}`);
});
