// Gabriela Lima - atendente virtual humanizada
const qrcode = require('qrcode-terminal');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const moment = require('moment-timezone');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para processar JSON
app.use(bodyParser.json());

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true }
});

const conversas = {}; // Estado por número

// Gerar QR Code no terminal
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ WhatsApp conectado com sucesso!');
});

// Inicializa WhatsApp
client.initialize();

// Função delay
const delay = ms => new Promise(res => setTimeout(res, ms));

// Atende mensagens do WhatsApp
client.on('message', async msg => {
    const chat = await msg.getChat();
    const contato = await msg.getContact();
    const nome = contato.pushname || "cliente";
    const telefone = msg.from;
    const texto = msg.body.toLowerCase().trim();

    if (!conversas[telefone]) conversas[telefone] = { etapa: 0 };

    await chat.sendStateTyping();
    await delay(1000);

    const etapa = conversas[telefone].etapa;

    if (texto.includes("oi") || texto.includes("bom dia") || texto.includes("boa tarde")) {
        await client.sendMessage(telefone, `*Gabriela Lima*\nOlá, ${nome}! Tudo bem? 😊\nSou *Gabriela Lima*, da Áureo Express. Como posso te ajudar hoje?\n\n1️⃣ Fazer um novo pedido\n2️⃣ Acompanhar pedido\n3️⃣ Tenho dúvidas`);
        conversas[telefone].etapa = 1;
        return;
    }

    switch (etapa) {
        case 1:
            if (texto === "1") {
                await client.sendMessage(telefone, `*Gabriela Lima*\nÓtimo! Qual produto você deseja adquirir?`);
                conversas[telefone].etapa = 2;
            } else if (texto === "2") {
                await client.sendMessage(telefone, `*Gabriela Lima*\nClaro! Me informe seu *nome completo* para eu localizar o pedido.`);
                conversas[telefone].etapa = 10;
            } else if (texto === "3") {
                await client.sendMessage(telefone, `*Gabriela Lima*\nPode mandar sua dúvida aqui que eu te ajudo rapidinho! 💬`);
                conversas[telefone].etapa = 20;
            } else {
                await client.sendMessage(telefone, `*Gabriela Lima*\nDigite apenas *1*, *2* ou *3* para que eu possa continuar 💛`);
            }
            break;

        case 2:
            conversas[telefone].produto = texto;
            await client.sendMessage(telefone, `*Gabriela Lima*\nPerfeito, vamos prosseguir com o seu pedido.\nPor favor, envie seu *endereço completo com CEP* para o envio.`);
            conversas[telefone].etapa = 3;
            break;

        case 3:
            conversas[telefone].endereco = texto;
            await client.sendMessage(telefone, `*Gabriela Lima*\nEndereço recebido! ✅\nComo deseja pagar?\n1️⃣ Pix\n2️⃣ Cartão`);
            conversas[telefone].etapa = 4;
            break;

        case 4:
            if (texto.includes("1")) {
                await client.sendMessage(telefone, `*Gabriela Lima*\n🔑 Chave Pix: *CNPJ 59800036000100*\n💵 Valor: *R$129,00*\n\nMe avise assim que pagar, tá bom?`);
            } else if (texto.includes("2")) {
                await client.sendMessage(telefone, `*Gabriela Lima*\n🔗 Link para pagar com cartão:\nhttps://aureo-express.pay.yampi.com.br/r/O839CRL949`);
            } else {
                await client.sendMessage(telefone, `*Gabriela Lima*\nEscolha entre *1* Pix ou *2* Cartão para continuar 😊`);
                return;
            }
            conversas[telefone].etapa = 5;

            setTimeout(async () => {
                await client.sendMessage(telefone, `*Gabriela Lima*\nVocê conseguiu efetuar o pagamento? Se precisar de ajuda, estou aqui! 💛`);
            }, 10 * 60 * 1000);
            break;

        case 5:
            await client.sendMessage(telefone, `*Gabriela Lima*\nSeu pedido está sendo processado! 😊 Se tiver qualquer dúvida, me chame aqui.`);
            conversas[telefone].etapa = 0;
            break;

        case 10:
            conversas[telefone].nomeCliente = texto;
            await client.sendMessage(telefone, `*Gabriela Lima*\nVerificando o status do seu pedido, aguarde um instante... 🔎`);
            await delay(5000);
            await client.sendMessage(telefone, `*Gabriela Lima*\nEncontrei aqui! Seu pedido está *em trânsito* e chega em breve. 📦`);
            conversas[telefone].etapa = 0;
            break;

        case 20:
            await client.sendMessage(telefone, `*Gabriela Lima*\nObrigada por enviar sua dúvida! Vamos analisar e logo mais alguém entra em contato com você se for necessário. 😉`);
            conversas[telefone].etapa = 0;
            break;

        default:
            await client.sendMessage(telefone, `*Gabriela Lima*\nNão entendi muito bem 😅. Você pode digitar *oi* para começar do zero.`);
            conversas[telefone].etapa = 0;
    }
});

// Webhook Yampi com validação de chave secreta
app.post('/webhook-yampi', async (req, res) => {
    const secretRecebido = req.headers['x-yampi-webhook-secret'];
    const chaveEsperada = "wh_Wyz0t8ddRjjoiWcQa2KLmjtcZTahe1SpvxxpQ";

    if (secretRecebido !== chaveEsperada) {
        console.log("❌ Webhook rejeitado: chave secreta inválida");
        return res.sendStatus(401);
    }

    console.log("📦 Webhook recebido da Yampi:", req.body);

    const pedido = req.body;
    const nome = pedido?.customer?.name;
    const telefone = pedido?.customer?.phone;
    const pagamento = pedido?.payment;
    const pagamentos = Array.isArray(pagamento) ? pagamento : [pagamento];

    if (telefone && nome) {
        let mensagem = `*Gabriela Lima*\nOi, ${nome}! 😍 Recebemos seu pedido!`;

        for (const p of pagamentos) {
            if (p.method === "pix") {
                const pix = p.pix;
                if (pix?.code) {
                    mensagem += `\n\n💰 *Pagamento via Pix:*\nCopie e cole o código abaixo:\n\`\`\`\n${pix.code}\n\`\`\``;
                }
            } else if (p.method === "boleto") {
                const boleto = p.boleto;
                if (boleto?.barcode) {
                    mensagem += `\n\n📄 *Pagamento via Boleto:*\nCódigo de barras:\n\`\`\`\n${boleto.barcode}\n\`\`\``;
                    if (boleto.link) {
                        mensagem += `\nLink do boleto: ${boleto.link}`;
                    }
                }
            }
        }

        mensagem += `\n\nAssim que o pagamento for confirmado, te envio o rastreio por aqui mesmo! 🧡`;

        await client.sendMessage(`${telefone}@c.us`, mensagem);
    }

    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor online na porta ${PORT}`);
});
