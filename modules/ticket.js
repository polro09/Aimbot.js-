// modules/ticket.js - 통합된 티켓 시스템 모듈 (수정 버전)
const { 
    EmbedBuilder, 
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    PermissionFlagsBits,
    ChannelType,
    SlashCommandBuilder,
    Events
  } = require('discord.js');
  const logger = require('../logger');
  const config = require('../config/bot-config');
  const commandManager = require('../commands');
  const fs = require('fs').promises;
  const path = require('path');
  
  /**
   * 티켓 시스템 모듈 클래스
   * ticket.js와 ticket-handler.js를 통합하고 개선한 버전
   */
  class TicketModule {
    constructor(client) {
      this.client = client;
      this.name = 'ticket';
      this.description = '티켓 시스템 모듈';
      this.enabled = true;
      
      // 티켓 처리를 위한 메모리 캐시
      this.messageMap = new Map();
      
      // 모듈 설정 초기화
      this.initializeConfig();
      
      // 명령어 등록
      this.registerCommands();
      
      logger.module(this.name, '티켓 시스템 모듈이 초기화되었습니다.');
    }
  
    /**
     * 모듈 설정 초기화
     */
    initializeConfig() {
      // 기본 설정 확인 및 설정
      const defaultConfig = {
        enabled: true,
        ticketCategoryId: null,
        adminRoleId: null
      };
      
      const moduleConfig = config.getModuleConfig(this.name);
      
      if (!moduleConfig || Object.keys(moduleConfig).length === 0) {
        config.updateModuleConfig(this.name, defaultConfig);
        logger.info(this.name, '기본 설정이 생성되었습니다.');
      }
      
      this.enabled = config.get(`modules.${this.name}.enabled`, true);
    }
  
    /**
     * 슬래시 커맨드 등록
     */
    registerCommands() {
      const ticketEmbedCommand = new SlashCommandBuilder()
        .setName('티켓')
        .setDescription('티켓 시스템 관리')
        .addSubcommand(subcommand =>
          subcommand
            .setName('임베드전송')
            .setDescription('티켓 생성 임베드를 채널에 전송합니다.')
            .addChannelOption(option =>
              option
                .setName('채널')
                .setDescription('임베드를 전송할 채널')
                .setRequired(true)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('생성카테고리')
            .setDescription('티켓이 생성될 카테고리를 설정합니다.')
            .addChannelOption(option =>
              option
                .setName('카테고리')
                .setDescription('티켓이 생성될 카테고리')
                .setRequired(true)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('관리자역할')
            .setDescription('티켓 관리자 역할을 설정합니다.')
            .addRoleOption(option =>
              option
                .setName('역할')
                .setDescription('티켓 관리자 역할')
                .setRequired(true)
            )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON();
  
      // 커맨드 매니저에 명령어 등록
      commandManager.registerModuleCommands(this.name, [ticketEmbedCommand]);
    }
  
    /**
     * 모듈 활성화 여부 설정
     * @param {boolean} enabled 활성화 여부
     */
    setEnabled(enabled) {
      this.enabled = enabled;
      logger.module(this.name, `모듈이 ${enabled ? '활성화' : '비활성화'}되었습니다.`);
    }
  
    /**
     * 명령어 처리 함수
     * @param {Interaction} interaction 상호작용 객체
     * @returns {boolean} 처리 여부
     */
    async handleCommands(interaction) {
      if (!interaction.isCommand()) return false;
      if (interaction.commandName !== '티켓') return false;
  
      const subcommand = interaction.options.getSubcommand();
  
      try {
        switch (subcommand) {
          case '임베드전송':
            await this.handleTicketEmbed(interaction);
            break;
          case '생성카테고리':
            await this.handleTicketCategory(interaction);
            break;
          case '관리자역할':
            await this.handleAdminRole(interaction);
            break;
          default:
            return false;
        }
        return true;
      } catch (error) {
        logger.error(this.name, `명령어 처리 중 오류 발생: ${error.message}`);
        
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor('#F04747')
                  .setTitle('❌ 오류 발생')
                  .setDescription(`요청을 처리하는 중 오류가 발생했습니다: ${error.message}`)
                  .setTimestamp()
                  .setFooter({ text: '🎷Blues', iconURL: interaction.guild?.iconURL() })
              ],
              ephemeral: true
            });
          } else {
            await interaction.followUp({
              embeds: [
                new EmbedBuilder()
                  .setColor('#F04747')
                  .setTitle('❌ 오류 발생')
                  .setDescription(`요청을 처리하는 중 오류가 발생했습니다: ${error.message}`)
                  .setTimestamp()
                  .setFooter({ text: '🎷Blues', iconURL: interaction.guild?.iconURL() })
              ],
              ephemeral: true
            });
          }
        } catch (replyError) {
          logger.error(this.name, `응답 오류: ${replyError.message}`);
        }
        return true;
      }
    }
  
    /**
     * 티켓 임베드 전송 명령어 처리
     * @param {Interaction} interaction 상호작용 객체
     */
    async handleTicketEmbed(interaction) {
      await interaction.deferReply({ ephemeral: true });
      
      const channel = interaction.options.getChannel('채널');
      
      // 채널 권한 확인
      if (!channel.viewable || !channel.permissionsFor(interaction.guild.members.me).has('SendMessages')) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 권한 오류')
              .setDescription('선택한 채널에 메시지를 보낼 권한이 없습니다!')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ]
        });
      }
      
      // 티켓 임베드 생성
      const ticketEmbed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('🎫 티켓')
        .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
        .setDescription('아래 버튼을 클릭하여 새 티켓을 생성하세요.\n문의사항, 길드 가입 신청 등을 위해 티켓을 생성할 수 있습니다.')
        .setThumbnail('https://imgur.com/74GDJnG.jpg')
        .addFields(
          { name: '📋 티켓 사용 방법', value: ':one: 아래 버튼을 클릭하여 새 티켓을 생성합니다.\n:two: 생성된 채널에서 필요한 정보를 입력합니다.\n:three: 관리자가 확인 후 처리해드립니다.' },
          { name: '✅ 티켓 생성 가능 사유', value: '• 💬 길드 가입 신청\n• ❓ 문의사항\n• 💡 건의사항\n• 🚨 신고' }
        )
        .setImage('https://imgur.com/LO32omi.png')
        .setTimestamp()
        .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() });
      
      // 버튼 생성
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('create_ticket')
            .setLabel('🎫 티켓 생성')
            .setStyle(ButtonStyle.Primary)
        );
      
      // 채널에 임베드 전송
      await channel.send({ embeds: [ticketEmbed], components: [row] });
      
      // 성공 메시지 전송
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('#43B581')
            .setTitle('✅ 작업 완료')
            .setDescription(`티켓 임베드가 <#${channel.id}> 채널에 성공적으로 전송되었습니다!`)
            .setTimestamp()
            .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
        ]
      });
      
      logger.success(this.name, `티켓 임베드가 ${channel.name} 채널에 전송되었습니다.`);
    }
  
    /**
     * 티켓 카테고리 설정 명령어 처리
     * @param {Interaction} interaction 상호작용 객체
     */
    async handleTicketCategory(interaction) {
      const category = interaction.options.getChannel('카테고리');
      
      // 카테고리 타입 확인
      if (category.type !== ChannelType.GuildCategory) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 설정 오류')
              .setDescription('선택한 채널이 카테고리가 아닙니다!')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ],
          ephemeral: true
        });
      }
      
      // 설정 업데이트
      config.updateModuleConfig(this.name, { ticketCategoryId: category.id });
      config.saveConfig();
      
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#43B581')
            .setTitle('✅ 작업 완료')
            .setDescription(`티켓 생성 카테고리가 \`${category.name}\`으로 설정되었습니다.`)
            .setTimestamp()
            .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
        ],
        ephemeral: true
      });
      
      logger.success(this.name, `티켓 생성 카테고리가 ${category.name}으로 설정되었습니다.`);
    }
  
    /**
     * 관리자 역할 설정 명령어 처리
     * @param {Interaction} interaction 상호작용 객체
     */
    async handleAdminRole(interaction) {
      const role = interaction.options.getRole('역할');
      
      // 설정 업데이트
      config.updateModuleConfig(this.name, { adminRoleId: role.id });
      config.saveConfig();
      
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#43B581')
            .setTitle('✅ 작업 완료')
            .setDescription(`티켓 관리자 역할이 \`${role.name}\`으로 설정되었습니다.`)
            .setTimestamp()
            .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
        ],
        ephemeral: true
      });
      
      logger.success(this.name, `티켓 관리자 역할이 ${role.name}으로 설정되었습니다.`);
    }
  
    /**
     * 버튼 인터랙션 처리
     * @param {Interaction} interaction 버튼 상호작용 객체
     * @returns {boolean} 처리 여부
     */
    async handleButtons(interaction) {
      if (!interaction.isButton()) return false;
      
      // 티켓 시스템 관련 버튼만 처리
      try {
        switch (interaction.customId) {
          case 'create_ticket':
            await this.handleCreateTicket(interaction);
            return true;
          case 'guild_rules':
            await this.handleGuildRules(interaction);
            return true;
          case 'registration_form':
            await this.handleTicketRegistrationForm(interaction);
            return true;
          case 'call_admin':
            await this.handleCallAdmin(interaction);
            return true;
          case 'close_ticket':
            await this.handleCloseTicket(interaction);
            return true;
          case 'agree_rules':
            await this.handleRulesAgreement(interaction);
            return true;
          case 'save_transcript':
            await this.handleSaveTranscript(interaction);
            return true;
          case 'skip_transcript':
            await this.handleSkipTranscript(interaction);
            return true;
          default:
            return false;
        }
      } catch (error) {
        logger.error(this.name, `버튼 처리 중 오류 발생: ${error.message}`);
        
        try {
          // 응답이 아직 안됐으면 응답
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor('#F04747')
                  .setTitle('❌ 오류 발생')
                  .setDescription('요청을 처리하는 중 오류가 발생했습니다. 나중에 다시 시도해주세요.')
                  .setTimestamp()
                  .setFooter({ text: '🎷Blues', iconURL: interaction.guild?.iconURL() })
              ],
              ephemeral: true
            });
          }
        } catch (replyError) {
          logger.error(this.name, `응답 오류: ${replyError.message}`);
        }
        
        return true;
      }
    }
  
    /**
     * 티켓 생성 버튼 클릭 처리
     * @param {ButtonInteraction} interaction 버튼 상호작용 객체
     */
    async handleCreateTicket(interaction) {
      await interaction.deferReply({ ephemeral: true });
      
      try {
        // 설정 확인
        const ticketCategoryId = config.get(`modules.${this.name}.ticketCategoryId`);
        if (!ticketCategoryId) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor('#F04747')
                .setTitle('❌ 설정 오류')
                .setDescription('티켓 카테고리가 설정되지 않았습니다. 관리자에게 문의해주세요.')
                .setTimestamp()
                .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
            ]
          });
        }
        
        const category = interaction.guild.channels.cache.get(ticketCategoryId);
        if (!category) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor('#F04747')
                .setTitle('❌ 설정 오류')
                .setDescription('설정된 티켓 카테고리를 찾을 수 없습니다. 관리자에게 문의해주세요.')
                .setTimestamp()
                .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
            ]
          });
        }
        
        const adminRoleId = config.get(`modules.${this.name}.adminRoleId`);
        if (!adminRoleId) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor('#F04747')
                .setTitle('❌ 설정 오류')
                .setDescription('관리자 역할이 설정되지 않았습니다. 관리자에게 문의해주세요.')
                .setTimestamp()
                .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
            ]
          });
        }
        
        const adminRole = interaction.guild.roles.cache.get(adminRoleId);
        if (!adminRole) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor('#F04747')
                .setTitle('❌ 설정 오류')
                .setDescription('설정된 관리자 역할을 찾을 수 없습니다. 관리자에게 문의해주세요.')
                .setTimestamp()
                .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
            ]
          });
        }
        
        // 사용자가 이미 티켓을 생성했는지 확인
        const existingTicket = interaction.guild.channels.cache.find(
          c => c.name.includes(`티켓-${interaction.user.username.toLowerCase()}`) && 
               c.parentId === ticketCategoryId
        );
        
        if (existingTicket) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor('#F04747')
                .setTitle('❌ 티켓 중복')
                .setDescription(`이미 생성된 티켓이 있습니다: <#${existingTicket.id}>`)
                .setTimestamp()
                .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
            ]
          });
        }
        
        // 티켓 채널 생성
        const ticketChannel = await interaction.guild.channels.create({
          name: `🎫${interaction.user.username}님의-티켓`,
          type: ChannelType.GuildText,
          parent: category,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionFlagsBits.ViewChannel]
            },
            {
              id: interaction.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
              ]
            },
            {
              id: adminRole.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages
              ]
            },
            {
              id: interaction.client.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles
              ]
            }
          ]
        });
        
        // 티켓 생성 완료 임베드
        const successEmbed = new EmbedBuilder()
          .setColor('#43B581')
          .setTitle('✅ 티켓 생성 완료')
          .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
          .setDescription('티켓이 성공적으로 생성되었습니다!')
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: '🔗 티켓 채널', value: `<#${ticketChannel.id}>` }
          )
          .setTimestamp()
          .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() });
        
        await interaction.editReply({ embeds: [successEmbed] });
        
        // 티켓 채널에 초기 메시지 전송
        const welcomeEmbed = new EmbedBuilder()
          .setColor('#3498db')
          .setTitle('🎫 새 티켓이 생성되었습니다')
          .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
          .setDescription(`👤 <@${interaction.user.id}>님의 티켓입니다.\n🔒 디스코드 id: ${interaction.user.id}`)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .setImage('https://imgur.com/LO32omi.png')
          .addFields(
            { name: '📌 중요 안내', value: '아래 버튼을 사용하여 원하는 작업을 진행하세요.\n문의가 완료되면 티켓 닫기를 선택해주세요.' },
            { name: '📜 길드 규칙', value: '길드 규칙을 확인하고 동의하면 가입 신청을 진행할 수 있습니다.', inline: true },
            { name: '📝 가입 신청서', value: '가입 신청서 양식을 작성하여 가입 절차를 시작합니다.', inline: true },
            { name: '🔔 관리자 호출', value: '긴급한 문의 사항이 있거나 관리자의 도움이 필요할 때 사용합니다.', inline: true },
            { name: '🔒 티켓 닫기', value: '모든 문의가 해결되었거나 가입 절차가 완료되면 티켓을 닫습니다.', inline: true }
          )
          .setTimestamp()
          .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() });
        
        // 버튼 생성
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('guild_rules')
              .setLabel('📜 길드 규칙')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('registration_form')
              .setLabel('📝 가입 신청서')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('call_admin')
              .setLabel('🔔 관리자 호출')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('close_ticket')
              .setLabel('🔒 티켓 닫기')
              .setStyle(ButtonStyle.Danger)
          );
        
        // 티켓 채널에 메시지 전송 및 사용자 멘션
        await ticketChannel.send({ content: `<@${interaction.user.id}> <@&${adminRoleId}>` });
        await ticketChannel.send({ embeds: [welcomeEmbed], components: [row] });
        
        logger.success(this.name, `${interaction.user.tag}님의 티켓이 생성되었습니다: ${ticketChannel.name}`);
      } catch (error) {
        logger.error(this.name, `티켓 생성 중 오류 발생: ${error.message}`);
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 오류 발생')
              .setDescription(`티켓 생성 중 오류가 발생했습니다: ${error.message}`)
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ]
        });
      }
    }
/**
   * 길드 규칙 버튼 클릭 처리
   * @param {ButtonInteraction} interaction 버튼 상호작용 객체
   */
async handleGuildRules(interaction) {
    try {
      // 임베드로 바로 응답하여 오류 피하기
      await interaction.deferReply();
      
      const rulesEmbed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('📜 길드 규칙')
        .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
        .setDescription('블루스 길드의 규칙입니다. 가입 전에 읽어주시고 숙지해주세요!')
        .setImage('https://imgur.com/LO32omi.png')
        .addFields(
          { name: '(1) 길드 운영 지침', value: 
            '1. 블루스는 만 19세 이상 성인길드입니다.\n' +
            '2. 길드 디스코드 가입은 필수입니다. 단, 길드 단톡 가입은 선택사항입니다.\n' +
            '3. 미접속 14일(2주)일 경우 탈퇴처리가 기본 원칙입니다. 단, 미접속게시판에 사유를 남겨주시면 정상참작해서 탈퇴처리를 보류합니다.\n' +
            '4. 길드 생활 중 불화가 있을 경우, 사안의 경중에 따라 경고 또는 탈퇴처리를 할 수 있습니다.(자세한 사항은 공지사항에 있는 블루스 내규를 확인해주세요.)\n' +
            '5. 이중길드는 원칙적으로 금지합니다.'
          },
          { name: '(2) 길드 생활 지침', value: 
            '1. 길드원간 기본적인 매너와 예의를 지켜주세요.\n' +
            '2. 각 길드원의 플레이스타일과, 취향, 성향을 존중해주세요.\n' +
            '3. 험담, 욕설 등을 자제해주세요.\n' +
            '4. 남미새, 여미새, 핑프족, 논란있는 커뮤 사용자는 길드원으로 거부합니다.\n' +
            '5. 사사게 이력이 있으신 분은 길드원으로 거부합니다.\n' +
            '6. 길드 생활 중 문제나 어려움이 생겼을 시에 임원에게 먼저 상담해주세요.\n' +
            '7. 길드 공지사항에 있는 내용들을 잘 확인해주세요.\n' +
            '8. 길드 규칙에 동의하신다면 아래의 버튼을 눌러주세요.'
          }
        )
        .setTimestamp()
        .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() });
      
      // 규칙 동의 버튼
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('agree_rules')
            .setLabel('✅규칙에 동의합니다')
            .setStyle(ButtonStyle.Success)
        );
      
      await interaction.editReply({ embeds: [rulesEmbed], components: [row] });
      logger.info(this.name, `${interaction.user.tag}님이 길드 규칙을 확인했습니다.`);
    } catch (error) {
      logger.error(this.name, `길드 규칙 표시 중 오류 발생: ${error.message}`);
      
      // 이미 응답한 경우
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 오류 발생')
              .setDescription('길드 규칙을 표시하는 중 오류가 발생했습니다. 다시 시도해주세요.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ],
          ephemeral: true
        });
      } else {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 오류 발생')
              .setDescription('길드 규칙을 표시하는 중 오류가 발생했습니다. 다시 시도해주세요.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ],
          ephemeral: true
        });
      }
    }
  }

  /**
   * 길드 규칙 동의 버튼 클릭 처리
   * @param {ButtonInteraction} interaction 버튼 상호작용 객체
   */
  async handleRulesAgreement(interaction) {
    try {
      const agreeEmbed = new EmbedBuilder()
        .setColor('#43B581')
        .setTitle('✅ 규칙 동의 완료')
        .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
        .setDescription(`<@${interaction.user.id}>님이 길드 규칙에 동의하셨습니다.`)
        .setTimestamp()
        .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() });
      
      await interaction.update({ embeds: [agreeEmbed], components: [] });
      logger.info(this.name, `${interaction.user.tag}님이 길드 규칙에 동의했습니다.`);
    } catch (error) {
      logger.error(this.name, `규칙 동의 처리 중 오류 발생: ${error.message}`);
      
      try {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 오류 발생')
              .setDescription('규칙 동의 처리 중 오류가 발생했습니다. 다시 시도해주세요.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ],
          ephemeral: true
        });
      } catch (replyError) {
        logger.error(this.name, `응답 오류: ${replyError.message}`);
      }
    }
  }

  /**
   * 가입 신청서 버튼 클릭 처리 - 가입신청서 생성 명령어와 같은 효과
   * @param {ButtonInteraction} interaction 버튼 상호작용 객체
   */
  async handleTicketRegistrationForm(interaction) {
    try {
      await interaction.deferReply();
      
      // 가입 신청서 채널 확인
      const channelId = config.get('modules.registration.channelId');
      if (!channelId) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 설정 필요')
              .setDescription('가입 신청서 채널이 설정되지 않았습니다. 먼저 `/가입신청서 설정` 명령어로 채널을 설정해주세요.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ]
        });
      }
      
      // 가입 신청서 임베드 생성 (명령어와 동일)
      const formEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
        .setTitle('🖊️ 블루스 길드 가입 신청서')
        .setDescription('아래 버튼을 클릭하여 가입 신청서를 작성해주세요.')
        .setImage('https://imgur.com/LO32omi.png')
        .addFields(
          { name: '📝 가입 신청서 1 (기본 정보)', value: '블루스를 알게 된 경로, 캐릭터명, 누렙 정보, 성별과 나이대, 플레이 기간을 작성합니다.', inline: false },
          { name: '📋 가입 신청서 2 (상세 정보)', value: '블로니 추억담 클리어 여부, 메인스트림 진행상황, 컨텐츠 관련 정보, 활동 시간 등을 작성합니다.', inline: false }
        )
        .setTimestamp()
        .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() });
      
      // 가입 신청서 버튼 생성 (명령어와 동일)
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('registration_form1')
            .setLabel('가입 신청서 1 (기본 정보)')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝'),
          new ButtonBuilder()
            .setCustomId('registration_form2')
            .setLabel('가입 신청서 2 (상세 정보)')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📋')
        );
      
      await interaction.editReply({ embeds: [formEmbed], components: [row] });
      logger.success(this.name, `${interaction.user.tag}님이 가입 신청서 양식을 요청했습니다.`);
    } catch (error) {
      logger.error(this.name, `가입 신청서 양식 표시 중 오류 발생: ${error.message}`);
      
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 오류 발생')
              .setDescription('가입 신청서 양식을 표시하는 중 오류가 발생했습니다.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ]
        });
      } else {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 오류 발생')
              .setDescription('가입 신청서 양식을 표시하는 중 오류가 발생했습니다.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ],
          ephemeral: true
        });
      }
    }
  }
/**
   * 관리자 호출 버튼 클릭 처리
   * @param {ButtonInteraction} interaction 버튼 상호작용 객체
   */
async handleCallAdmin(interaction) {
    try {
      await interaction.deferReply();
      
      // 관리자 역할 확인
      const adminRoleId = config.get(`modules.${this.name}.adminRoleId`);
      if (!adminRoleId) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 설정 오류')
              .setDescription('관리자 역할이 설정되지 않았습니다.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ]
        });
      }
      
      // 호출 임베드 생성
      const callEmbed = new EmbedBuilder()
        .setColor('#FF9900')
        .setTitle('🔔 관리자 호출')
        .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
        .setDescription(`<@${interaction.user.id}>님이 관리자를 호출했습니다.`)
        .setTimestamp()
        .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() });
      
      await interaction.editReply({
        content: `<@&${adminRoleId}>`,
        embeds: [callEmbed],
        allowedMentions: { roles: [adminRoleId] }
      });
      
      logger.info(this.name, `${interaction.user.tag}님이 관리자를 호출했습니다.`);
    } catch (error) {
      logger.error(this.name, `관리자 호출 중 오류 발생: ${error.message}`);
      
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor('#F04747')
                .setTitle('❌ 오류 발생')
                .setDescription('관리자 호출 중 오류가 발생했습니다.')
                .setTimestamp()
                .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
            ]
          });
        } else {
          await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#F04747')
                .setTitle('❌ 오류 발생')
                .setDescription('관리자 호출 중 오류가 발생했습니다.')
                .setTimestamp()
                .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
            ],
            ephemeral: true
          });
        }
      } catch (replyError) {
        logger.error(this.name, `응답 오류: ${replyError.message}`);
      }
    }
  }

  /**
   * 티켓 닫기 버튼 클릭 처리
   * @param {ButtonInteraction} interaction 버튼 상호작용 객체
   */
  async handleCloseTicket(interaction) {
    try {
      await interaction.deferReply();
      
      // 티켓 닫기 임베드 생성
      const closeEmbed = new EmbedBuilder()
        .setColor('#F04747')
        .setTitle('🔒 티켓 닫기')
        .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
        .setDescription('티켓을 닫기전 아래 버튼을 선택해주세요')
        .addFields(
            { name: '💾 대화 내용 저장', value: '티켓의 대화 내용을 저장합니다.', inline: false },
            { name: '🔒 저장 없이 닫기', value: '티켓의 내용을 저장없이 닫습니다.', inline: false }
          )
        .setTimestamp()
        .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() });
      
      // 대화 내용 첨부 버튼
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('save_transcript')
            .setLabel('💾 대화 내용 저장')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('skip_transcript')
            .setLabel('🔒 저장 없이 닫기')
            .setStyle(ButtonStyle.Secondary)
        );
      
      await interaction.editReply({ embeds: [closeEmbed], components: [row] });
      logger.info(this.name, `${interaction.user.tag}님이 티켓 닫기를 요청했습니다.`);
    } catch (error) {
      logger.error(this.name, `티켓 닫기 중 오류 발생: ${error.message}`);
      
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor('#F04747')
                .setTitle('❌ 오류 발생')
                .setDescription('티켓 닫기 중 오류가 발생했습니다.')
                .setTimestamp()
                .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
            ]
          });
        } else {
          await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#F04747')
                .setTitle('❌ 오류 발생')
                .setDescription('티켓 닫기 중 오류가 발생했습니다.')
                .setTimestamp()
                .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
            ],
            ephemeral: true
          });
        }
      } catch (replyError) {
        logger.error(this.name, `응답 오류: ${replyError.message}`);
      }
    }
  }

  /**
   * 대화 내용 저장 버튼 클릭 처리
   * @param {ButtonInteraction} interaction 버튼 상호작용 객체
   */
  async handleSaveTranscript(interaction) {
    try {
      await interaction.deferUpdate();
      
      // 가입 신청서 보관 채널 확인 (registration 모듈 설정 활용)
      const applicationChannelId = config.get(`modules.registration.channelId`);
      if (!applicationChannelId) {
        await interaction.followUp({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 설정 오류')
              .setDescription('보관 채널이 설정되지 않았습니다. `/가입신청서 설정` 명령어로 채널을 설정해주세요.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ]
        });
        return this.closeTicketChannel(interaction.channel);
      }
      
      const applicationChannel = interaction.guild.channels.cache.get(applicationChannelId);
      if (!applicationChannel) {
        await interaction.followUp({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 채널 오류')
              .setDescription('보관 채널을 찾을 수 없습니다.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ]
        });
        return this.closeTicketChannel(interaction.channel);
      }
      
      // 대화 내용 가져오기
      await interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setColor('#3498db')
            .setTitle('💾 대화 내용 저장 중')
            .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
            .setDescription('대화 내용을 저장하고 있습니다...')
            .setTimestamp()
            .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
        ]
      });
      
      const transcript = await this.createTranscript(interaction.channel);
      
      // 대화 내용 파일로 저장
      const buffer = Buffer.from(transcript, 'utf-8');
      const fileName = `transcript-${interaction.channel.name}-${Date.now()}.txt`;
      
      // 파일 첨부
      await applicationChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('💾 저장된 티켓 내용')
            .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
            .setDescription(`**${interaction.channel.name}**의 대화 내용입니다.`)
            .setTimestamp()
            .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
        ],
        files: [{ attachment: buffer, name: fileName }]
      });
      
      await interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setColor('#43B581')
            .setTitle('✅ 저장 완료')
            .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
            .setDescription('대화 내용이 성공적으로 저장되었습니다.')
            .setTimestamp()
            .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
        ]
      });
      
      // 티켓 채널 닫기
      setTimeout(() => this.closeTicketChannel(interaction.channel), 2000);
      
      logger.success(this.name, `${interaction.user.tag}님이 티켓 대화 내용을 저장했습니다.`);
    } catch (error) {
      logger.error(this.name, `대화 내용 저장 중 오류 발생: ${error.message}`);
      
      try {
        await interaction.followUp({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 오류 발생')
              .setDescription('대화 내용 저장 중 오류가 발생했습니다.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ]
        });
      } catch (followUpError) {
        logger.error(this.name, `응답 오류: ${followUpError.message}`);
      }
      
      // 오류가 발생해도 티켓 채널은 닫기
      setTimeout(() => this.closeTicketChannel(interaction.channel), 2000);
    }
  }
/**
   * 저장 없이 닫기 버튼 클릭 처리
   * @param {ButtonInteraction} interaction 버튼 상호작용 객체
   */
async handleSkipTranscript(interaction) {
    try {
      await interaction.deferUpdate();
      
      await interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setColor('#F04747')
            .setTitle('🔒 티켓 닫기')
            .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
            .setDescription('대화 내용을 저장하지 않고 티켓을 닫습니다.')
            .setTimestamp()
            .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
        ]
      });
      
      // 티켓 채널 닫기
      setTimeout(() => this.closeTicketChannel(interaction.channel), 2000);
      
      logger.info(this.name, `${interaction.user.tag}님이 대화 내용을 저장하지 않고 티켓을 닫았습니다.`);
    } catch (error) {
      logger.error(this.name, `티켓 닫기 중 오류 발생: ${error.message}`);
      
      try {
        await interaction.followUp({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 오류 발생')
              .setDescription('티켓 닫기 중 오류가 발생했습니다.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ]
        });
      } catch (followUpError) {
        logger.error(this.name, `응답 오류: ${followUpError.message}`);
      }
      
      // 오류가 발생해도 티켓 채널은 닫기
      setTimeout(() => this.closeTicketChannel(interaction.channel), 2000);
    }
  }

  /**
   * 티켓 채널 닫기
   * @param {TextChannel} channel 티켓 채널
   */
  async closeTicketChannel(channel) {
    try {
      if (!channel) {
        logger.error(this.name, '채널이 없어 삭제할 수 없습니다.');
        return;
      }
      
      await channel.delete();
      logger.success(this.name, `티켓 채널 ${channel.name}이(가) 삭제되었습니다.`);
    } catch (error) {
      logger.error(this.name, `티켓 채널 삭제 중 오류 발생: ${error.message}`);
    }
  }

  /**
   * 대화 내용 트랜스크립트 생성
   * @param {TextChannel} channel 티켓 채널
   * @returns {string} 트랜스크립트 텍스트
   */
  async createTranscript(channel) {
    let transcript = `=== 티켓: ${channel.name} ===\n`;
    transcript += `생성 시간: ${channel.createdAt.toLocaleString('ko-KR')}\n`;
    transcript += `서버: ${channel.guild.name}\n\n`;
    
    let lastMessageId = null;
    let allMessages = [];
    
    // 최대 500개 메시지 가져오기 (API 제한 때문에)
    try {
      let messagesLeft = true;
      
      while (messagesLeft) {
        const options = { limit: 100 };
        if (lastMessageId) options.before = lastMessageId;
        
        const messages = await channel.messages.fetch(options);
        
        if (messages.size === 0) {
          messagesLeft = false;
          break;
        }
        
        allMessages = [...allMessages, ...messages.values()];
        lastMessageId = messages.last().id;
        
        if (messages.size < 100) {
          messagesLeft = false;
        }
      }
      
      // 메시지 시간순으로 정렬
      allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      
      // 메시지 포맷팅
      for (const message of allMessages) {
        const timestamp = message.createdAt.toLocaleString('ko-KR');
        let content = message.content || '(내용 없음)';
        
        // 임베드가 있으면 설명 추가
        if (message.embeds.length > 0) {
          for (const embed of message.embeds) {
            if (embed.description) {
              content += `\n[임베드] ${embed.description}`;
            }
            
            if (embed.fields && embed.fields.length > 0) {
              for (const field of embed.fields) {
                if (field.name && field.value) {
                  content += `\n[임베드 필드: ${field.name}] ${field.value}`;
                }
              }
            }
          }
        }
        
        // 첨부 파일이 있으면 추가
        if (message.attachments.size > 0) {
          content += `\n[첨부 파일: ${message.attachments.size}개]`;
          message.attachments.forEach(attachment => {
            content += `\n- ${attachment.name}: ${attachment.url}`;
          });
        }
        
        transcript += `[${timestamp}] ${message.author.tag}: ${content}\n\n`;
      }
      
      return transcript;
    } catch (error) {
      logger.error(this.name, `트랜스크립트 생성 중 오류 발생: ${error.message}`);
      return `트랜스크립트 생성 중 오류가 발생했습니다: ${error.message}`;
    }
  }

  /**
   * 메시지 감지 및 가입 신청서 텍스트 처리
   * @param {Message} message 메시지 객체
   */
  async handleMessage(message) {
    // 봇 메시지는 무시
    if (message.author.bot) return;
    
    // 티켓 채널인지 확인
    if (!message.channel.name.includes('티켓')) return;
    
    try {
      // 긴 메시지인지 확인 (가입 신청서로 간주할 수 있는지)
      if (message.content.length < 200) return;
      
      // 가입 신청서 패턴 확인
      const isApplication = 
        message.content.includes('가입 신청서') || 
        message.content.includes('블루스를 알게') ||
        message.content.includes('캐릭터명') ||
        (message.content.includes('1.') && message.content.includes('2.') && message.content.includes('3.'));
      
      if (!isApplication) return;
      
      logger.info(this.name, `${message.author.tag}님이 텍스트 형식의 가입 신청서를 제출했습니다.`);
      
      // registration 모듈에 양식을 사용하도록 안내 메시지 전송
      const guideEmbed = new EmbedBuilder()
        .setColor('#F04747')
        .setTitle('✏️ 가입 신청서 양식 안내')
        .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
        .setDescription('가입 신청서를 텍스트 형식으로 제출하셨습니다. 아래 가입 신청서 버튼을 사용해주세요.')
        .addFields({
          name: '📝 가입 신청서 작성 방법',
          value: '티켓 채널 상단의 "가입 신청서" 버튼을 클릭하여 공식 양식으로 작성해주세요.'
        })
        .setTimestamp()
        .setFooter({ text: '🎷Blues', iconURL: message.guild.iconURL() });
      
      await message.reply({ embeds: [guideEmbed] });
      
      logger.info(this.name, `${message.author.tag}님에게 가입 신청서 사용 안내를 전송했습니다.`);
    } catch (error) {
      logger.error(this.name, `메시지 처리 중 오류 발생: ${error.message}`);
    }
  }

  /**
   * 메시지 ID 저장 (업데이트를 위한 임시 저장)
   * @param {string} channelId 채널 ID
   * @param {string} userId 사용자 ID
   * @param {string} ticketMessageId 티켓 채널 메시지 ID
   * @param {string} archiveMessageId 보관 채널 메시지 ID
   */
  saveMessageIds(channelId, userId, ticketMessageId, archiveMessageId) {
    this.messageMap.set(`${channelId}-${userId}`, {
      ticketMessageId,
      archiveMessageId
    });
  }

  /**
   * 모듈 이벤트 리스너 등록
   */
  registerEvents() {
    if (!this.enabled) {
      logger.warn(this.name, '모듈이 비활성화되어 있어 이벤트를 등록하지 않습니다.');
      return;
    }

    // 버튼 클릭 이벤트 리스너
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (interaction.isButton()) {
        await this.handleButtons(interaction);
      }
    });

    // 메시지 생성 이벤트 리스너
    this.client.on(Events.MessageCreate, async (message) => {
      await this.handleMessage(message);
    });

    logger.success(this.name, '티켓 모듈 이벤트 리스너가 등록되었습니다.');
  }

  /**
   * 모듈을 시작합니다.
   */
  async start() {
    if (this.enabled) {
      this.registerEvents();
      logger.success(this.name, '티켓 시스템 모듈이 활성화되었습니다.');
    } else {
      logger.warn(this.name, '티켓 시스템 모듈이 비활성화되어 있습니다.');
    }
    return this;
  }
}

module.exports = (client) => new TicketModule(client);