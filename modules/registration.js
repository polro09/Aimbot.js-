// modules/registration.js - 티켓 시스템과 통합되도록 개선
const { 
    SlashCommandBuilder, 
    PermissionFlagsBits,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    Events,
    ChannelType
  } = require('discord.js');
  const logger = require('../logger');
  const config = require('../config/bot-config');
  const commandManager = require('../commands');
  
  /**
   * 가입 신청서 모듈 클래스
   */
  class RegistrationModule {
    constructor(client) {
      this.client = client;
      this.name = 'registration';
      this.description = '가입 신청서 처리 모듈';
      this.enabled = config.get(`modules.${this.name}.enabled`, true);
      this.configurable = true;
      
      // 신청서 처리를 위한 메모리 캐시
      this.pendingForms = new Map();
      
      // 명령어 등록
      this.registerCommands();
      
      logger.module(this.name, '가입 신청서 모듈이 초기화되었습니다.');
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
     * 슬래시 커맨드 등록
     */
    registerCommands() {
      const registrationCommand = new SlashCommandBuilder()
        .setName('가입신청서')
        .setDescription('가입 신청서 명령어')
        .addSubcommand(subcommand =>
          subcommand
            .setName('설정')
            .setDescription('가입 신청서 채널을 설정합니다.')
            .addChannelOption(option => 
              option.setName('채널')
                .setDescription('가입신청서 결과가 전송될 채널')
                .setRequired(true))
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('생성')
            .setDescription('현재 채널에 가입 신청서 양식을 생성합니다.')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .toJSON();
      
      // 명령어 매니저에 등록
      commandManager.registerModuleCommands(this.name, [registrationCommand]);
    }
  
    /**
     * 모듈 시작
     */
    async start() {
      if (this.enabled) {
        logger.success(this.name, '가입 신청서 모듈이 활성화되었습니다.');
      } else {
        logger.warn(this.name, '가입 신청서 모듈이 비활성화되어 있습니다.');
      }
      return this;
    }
  
    /**
     * 명령어 핸들링
     * @param {Interaction} interaction 명령어 인터렉션
     * @returns {boolean} 처리 여부
     */
    async handleCommands(interaction) {
      if (!interaction.isCommand()) return false;
  
      const { commandName } = interaction;
      
      if (commandName !== '가입신청서') return false;
      
      if (!this.enabled) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 모듈 비활성화')
              .setDescription('가입 신청서 모듈이 비활성화되어 있습니다.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ],
          ephemeral: true
        });
        return true;
      }
  
      const subcommand = interaction.options.getSubcommand();
      
      if (subcommand === '설정') {
        await this.handleSetupCommand(interaction);
      } else if (subcommand === '생성') {
        await this.handleCreateFormCommand(interaction);
      }
      
      return true;
    }
  
    /**
     * 버튼 인터랙션 핸들링
     * @param {Interaction} interaction 버튼 인터렉션
     * @returns {boolean} 처리 여부
     */
    async handleButtons(interaction) {
      if (!interaction.isButton() || !this.enabled) return false;
      
      const { customId } = interaction;
      
      if (customId === 'registration_form1') {
        await this.handleForm1Button(interaction);
        return true;
      } else if (customId === 'registration_form2') {
        await this.handleForm2Button(interaction);
        return true;
      } else if (customId.startsWith('registration_approve_')) {
        await this.handleApproveButton(interaction);
        return true;
      } else if (customId.startsWith('registration_reject_')) {
        await this.handleRejectButton(interaction);
        return true;
      }
      
      return false;
    }
  
    /**
     * 모달 제출 핸들링
     * @param {Interaction} interaction 모달 인터렉션
     * @returns {boolean} 처리 여부
     */
    async handleModals(interaction) {
      if (!interaction.isModalSubmit() || !this.enabled) return false;
      
      const { customId } = interaction;
      
      if (customId === 'registration_form1_modal') {
        await this.handleForm1Modal(interaction);
        return true;
      } else if (customId === 'registration_form2_modal') {
        await this.handleForm2Modal(interaction);
        return true;
      } else if (customId.startsWith('registration_reject_reason_')) {
        await this.handleRejectReasonModal(interaction);
        return true;
      }
      
      return false;
    }
  
    /**
     * 가입 신청서 설정 명령어 처리
     * @param {Interaction} interaction 명령어 인터렉션
     */
    async handleSetupCommand(interaction) {
      try {
        const channel = interaction.options.getChannel('채널');
        
        // 채널 권한 확인
        if (!channel.viewable || !channel.permissionsFor(interaction.guild.members.me).has('SendMessages')) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#F04747')
                .setTitle('❌ 권한 오류')
                .setDescription('선택한 채널에 메시지를 보낼 권한이 없습니다.')
                .setTimestamp()
                .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
            ],
            ephemeral: true
          });
        }
        
        // 설정 업데이트
        config.updateModuleConfig(this.name, { channelId: channel.id });
        config.saveConfig();
        
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#43B581')
              .setTitle('✅ 작업 완료')
              .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
              .setDescription(`가입 신청서 결과가 <#${channel.id}> 채널로 전송됩니다.`)
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ]
        });
        
        logger.success(this.name, `가입 신청서 채널이 #${channel.name} (${channel.id})로 설정되었습니다.`);
      } catch (error) {
        logger.error(this.name, `가입 신청서 채널 설정 오류: ${error.message}`);
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 오류 발생')
              .setDescription('가입 신청서 채널 설정 중 오류가 발생했습니다.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ],
          ephemeral: true
        });
      }
    }
  
    /**
     * 가입 신청서 생성 명령어 처리
     * @param {Interaction} interaction 명령어 인터렉션
     */
    async handleCreateFormCommand(interaction) {
      try {
        const channelId = config.get('modules.registration.channelId');
        
        if (!channelId) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#F04747')
                .setTitle('❌ 설정 필요')
                .setDescription('가입 신청서 채널이 설정되지 않았습니다. `/가입신청서 설정` 명령어로 먼저 채널을 설정해주세요.')
                .setTimestamp()
                .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
            ],
            ephemeral: true
          });
        }
        
        const formEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
          .setTitle('🖊️ 블루스 길드 가입 신청서')
          .setDescription('아래 버튼을 클릭하여 가입 신청서를 작성해주세요.')
          .setImage('https://imgur.com/LO32omi.png')
          .addFields(
            { name: '📝가입 신청서 1 (기본 정보)', value: '블루스를 알게 된 경로, 캐릭터명, 누렙 정보, 성별과 나이대, 플레이 기간을 작성합니다.', inline: false },
            { name: '📋가입 신청서 2 (상세 정보)', value: '블로니 추억담 클리어 여부, 메인스트림 진행상황, 컨텐츠 관련 정보, 활동 시간 등을 작성합니다.', inline: false }
          )
          .setTimestamp()
          .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() });
        
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
        
        await interaction.channel.send({
          embeds: [formEmbed],
          components: [row]
        });
        
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#43B581')
              .setTitle('✅ 작업 완료')
              .setDescription('가입 신청서가 현재 채널에 생성되었습니다.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ],
          ephemeral: true
        });
        
        logger.success(this.name, `${interaction.user.tag}님이 가입 신청서를 생성했습니다.`);
      } catch (error) {
        logger.error(this.name, `가입 신청서 생성 오류: ${error.message}`);
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 오류 발생')
              .setDescription('가입 신청서 생성 중 오류가 발생했습니다.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ],
          ephemeral: true
        });
      }
    }
  
    /**
     * 가입 신청서 1 버튼 클릭 처리
     * @param {Interaction} interaction 버튼 인터렉션
     */
    async handleForm1Button(interaction) {
      try {
        // 10가지 질문으로 변경된 가입 신청서 - 기본 정보 (1-5번 질문)
        const modal = new ModalBuilder()
          .setCustomId('registration_form1_modal')
          .setTitle('블루스 길드 가입 신청서 1 (기본 정보)');
        
        // 신청서 입력 필드 - 1-5번 질문
        const sourceInput = new TextInputBuilder()
          .setCustomId('source')
          .setLabel('1. 블루스를 알게 되신 경로를 알려주세요.')
          .setPlaceholder('예: 거뿔/마도카/공홈/지인추천 등')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const characterInfoInput = new TextInputBuilder()
          .setCustomId('characterInfo')
          .setLabel('2. 현재 캐릭터명과 누렙 주아르카나를 알려주세요.')
          .setPlaceholder('캐릭터명/누렙/아르카나')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const genderAgeInput = new TextInputBuilder()
          .setCustomId('genderAge')
          .setLabel('3. 성별과 나이대를 알려주세요.')
          .setPlaceholder('해당 정보는 임원들에게만 알립니다')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const playTimeInput = new TextInputBuilder()
          .setCustomId('playTime')
          .setLabel('4. 마비노기를 플레이한지 얼마 정도 되셨나요?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const blronoInput = new TextInputBuilder()
          .setCustomId('blrono')
          .setLabel('5. 블로니 추억담 3권까지 클리어 하셨나요?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        // 모달에 입력 필드 추가
        const row1 = new ActionRowBuilder().addComponents(sourceInput);
        const row2 = new ActionRowBuilder().addComponents(characterInfoInput);
        const row3 = new ActionRowBuilder().addComponents(genderAgeInput);
        const row4 = new ActionRowBuilder().addComponents(playTimeInput);
        const row5 = new ActionRowBuilder().addComponents(blronoInput);
        
        modal.addComponents(row1, row2, row3, row4, row5);
        
        await interaction.showModal(modal);
        logger.info(this.name, `${interaction.user.tag}님이 가입 신청서 1 모달을 열었습니다.`);
      } catch (error) {
        logger.error(this.name, `가입 신청서 1 모달 표시 오류: ${error.message}`);
      }
    }
/**
   * 가입 신청서 2 버튼 클릭 처리
   * @param {Interaction} interaction 버튼 인터렉션
   */
async handleForm2Button(interaction) {
    try {
      // 10가지 질문으로 변경된 가입 신청서 - 상세 정보 (6-10번 질문)
      const modal = new ModalBuilder()
        .setCustomId('registration_form2_modal')
        .setTitle('블루스 길드 가입 신청서 2 (상세 정보)');
      
      // 신청서 입력 필드 - 6-10번 질문
      const mainstreamInput = new TextInputBuilder()
        .setCustomId('mainstream')
        .setLabel('6. 메인스트림 진행상황을 알려주세요.')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      const contentsInput = new TextInputBuilder()
        .setCustomId('contents')
        .setLabel('7. 주로 하는 컨텐츠를 알려주세요.')
        .setPlaceholder('생활, 교역 or 주로 가는 던전 or 석상 등')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      
      const wantedContentsInput = new TextInputBuilder()
        .setCustomId('wantedContents')
        .setLabel('8. 앞으로 하고 싶은 컨텐츠를 알려주세요.')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      const activeTimeInput = new TextInputBuilder()
        .setCustomId('activeTime')
        .setLabel('9. 주로 접속/활동하는 시간을 알려주세요.')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      const expectationInput = new TextInputBuilder()
        .setCustomId('expectation')
        .setLabel('10. 기대하는 길드활동이 있다면 알려주세요.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);
      
      // 모달에 입력 필드 추가
      const row1 = new ActionRowBuilder().addComponents(mainstreamInput);
      const row2 = new ActionRowBuilder().addComponents(contentsInput);
      const row3 = new ActionRowBuilder().addComponents(wantedContentsInput);
      const row4 = new ActionRowBuilder().addComponents(activeTimeInput);
      const row5 = new ActionRowBuilder().addComponents(expectationInput);
      
      modal.addComponents(row1, row2, row3, row4, row5);
      
      await interaction.showModal(modal);
      logger.info(this.name, `${interaction.user.tag}님이 가입 신청서 2 모달을 열었습니다.`);
    } catch (error) {
      logger.error(this.name, `가입 신청서 2 모달 표시 오류: ${error.message}`);
    }
  }

  /**
   * 가입 신청서 1 모달 제출 처리
   * @param {Interaction} interaction 모달 인터렉션
   */
  async handleForm1Modal(interaction) {
    try {
      await interaction.deferReply();
      
      // 필드값 가져오기 - 1-5번 질문
      const source = interaction.fields.getTextInputValue('source');
      const characterInfo = interaction.fields.getTextInputValue('characterInfo');
      const genderAge = interaction.fields.getTextInputValue('genderAge');
      const playTime = interaction.fields.getTextInputValue('playTime');
      const blrono = interaction.fields.getTextInputValue('blrono');
      
      // 가입 신청서 결과 채널 ID 가져오기
      const channelId = config.get('modules.registration.channelId');
      if (!channelId) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 설정 오류')
              .setDescription('가입 신청서 채널이 설정되지 않았습니다. 관리자에게 문의하세요.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ]
        });
      }
      
      // 가입 신청서 채널 가져오기
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 채널 오류')
              .setDescription('가입 신청서 채널을 찾을 수 없습니다. 관리자에게 문의하세요.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ]
        });
      }
      
      // 결과 임베드 생성
      const resultEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
        .setTitle('📝 가입 신청서 1 (기본 정보)')
        .setDescription(`${interaction.user.tag} (${interaction.user.id})님이 작성한 가입 신청서입니다.`)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() });
      
      // 필드 정보 추가
      resultEmbed.addFields(
        { name: '1. 블루스를 알게 된 경로', value: source || '작성되지 않음', inline: true },
        { name: '2. 캐릭터명과 누렙 주아르카나', value: characterInfo || '작성되지 않음', inline: true },
        { name: '3. 성별과 나이대', value: genderAge || '작성되지 않음', inline: true },
        { name: '4. 플레이 기간', value: playTime || '작성되지 않음', inline: true },
        { name: '5. 블로니 추억담 3권 클리어 여부', value: blrono || '작성되지 않음', inline: true }
      );
      
      // 채널에 결과 전송
      await channel.send({ embeds: [resultEmbed] });
      
      // 완료 메시지
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('#43B581')
            .setTitle('📝 가입 신청서 제출 완료')
            .setDescription('가입 신청서 1(기본 정보)가 성공적으로 제출되었습니다.\n가입 신청서 2(상세 정보)도 작성해주세요.')
            .setTimestamp()
            .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
        ]
      });
      
      // 신청서 1 정보를 임시 저장
      this.pendingForms.set(interaction.user.id, {
        part1: {
          source,
          characterInfo,
          genderAge,
          playTime,
          blrono
        }
      });
      
      logger.success(this.name, `${interaction.user.tag}님이 가입 신청서 1을 제출했습니다.`);
    } catch (error) {
      logger.error(this.name, `가입 신청서 1 처리 오류: ${error.message}`);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('#F04747')
            .setTitle('❌ 오류 발생')
            .setDescription('가입 신청서를 처리하는 중 오류가 발생했습니다.')
            .setTimestamp()
            .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
        ]
      });
    }
  }

  /**
   * 가입 신청서 2 모달 제출 처리
   * @param {Interaction} interaction 모달 인터렉션
   */
  async handleForm2Modal(interaction) {
    try {
      await interaction.deferReply();
      
      // 필드값 가져오기 - 6-10번 질문
      const mainstream = interaction.fields.getTextInputValue('mainstream');
      const contents = interaction.fields.getTextInputValue('contents');
      const wantedContents = interaction.fields.getTextInputValue('wantedContents');
      const activeTime = interaction.fields.getTextInputValue('activeTime');
      const expectation = interaction.fields.getTextInputValue('expectation') || '없음';
      
      // 가입 신청서 1 내용 확인
      const pendingForm = this.pendingForms.get(interaction.user.id);
      
      // 가입 신청서 결과 채널 ID 가져오기
      const channelId = config.get('modules.registration.channelId');
      if (!channelId) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 설정 오류')
              .setDescription('가입 신청서 채널이 설정되지 않았습니다. 관리자에게 문의하세요.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ]
        });
      }
      
      // 가입 신청서 채널 가져오기
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 채널 오류')
              .setDescription('가입 신청서 채널을 찾을 수 없습니다. 관리자에게 문의하세요.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ]
        });
      }
      
      // 결과 임베드 생성
      const resultEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
        .setTitle('📋 가입 신청서 2 (상세 정보)')
        .setDescription(`${interaction.user.tag} (${interaction.user.id})님이 작성한 가입 신청서입니다.`)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() });
        // 필드 정보 추가
      resultEmbed.addFields(
        { name: '6. 메인스트림 진행상황', value: mainstream || '작성되지 않음', inline: false },
        { name: '7. 주로 하는 컨텐츠', value: contents || '작성되지 않음', inline: false },
        { name: '8. 앞으로 하고 싶은 컨텐츠', value: wantedContents || '작성되지 않음', inline: false },
        { name: '9. 주 접속/활동 시간', value: activeTime || '작성되지 않음', inline: false },
        { name: '10. 기대하는 길드활동', value: expectation || '없음', inline: false },
        { name: '신청 상태', value: '⏳ 검토 중', inline: true },
        { name: '처리자', value: '없음', inline: true }
      );

      // 승인/거부 버튼 추가
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`registration_approve_${interaction.user.id}`)
            .setLabel('승인')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId(`registration_reject_${interaction.user.id}`)
            .setLabel('거부')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
        );
      
      // 채널에 결과 전송
      await channel.send({ 
        embeds: [resultEmbed],
        components: [row]
      });
      
      // 완료 메시지
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('#43B581')
            .setTitle('📋 가입 신청서 제출 완료')
            .setDescription('가입 신청서 2(상세 정보)가 성공적으로 제출되었습니다.\n관리자의 검토 및 승인을 기다려주세요 DM으로 전송됩니다.')
            .setTimestamp()
            .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
        ]
      });
      
      // 양식 정보 정리 (불필요한 메모리 사용 방지)
      this.pendingForms.delete(interaction.user.id);
      
      logger.success(this.name, `${interaction.user.tag}님이 가입 신청서 2를 제출했습니다.`);
    } catch (error) {
      logger.error(this.name, `가입 신청서 2 처리 오류: ${error.message}`);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('#F04747')
            .setTitle('❌ 오류 발생')
            .setDescription('가입 신청서를 처리하는 중 오류가 발생했습니다.')
            .setTimestamp()
            .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
        ]
      });
    }
  }

  /**
   * 가입 신청서 승인 버튼 처리
   * @param {Interaction} interaction 버튼 인터렉션
   */
  async handleApproveButton(interaction) {
    try {
      // 승인 권한 체크
      const adminRoleId = config.get('modules.ticket.adminRoleId') || config.get('modules.registration.approvalRoleId');
      if (adminRoleId && !interaction.member.roles.cache.has(adminRoleId)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 권한 부족')
              .setDescription('가입 신청서를 승인할 권한이 없습니다.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ],
          ephemeral: true
        });
      }
      
      // 유저 ID 가져오기
      const userId = interaction.customId.split('_')[2];
      if (!userId) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 오류 발생')
              .setDescription('유저 ID를 찾을 수 없습니다.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ],
          ephemeral: true
        });
      }
      
      // 원본 메시지 업데이트
      const message = interaction.message;
      const embed = message.embeds[0];
      
      // 임베드 업데이트
      const updatedEmbed = EmbedBuilder.from(embed)
        .setColor('#43B581')
        .spliceFields(embed.fields.length - 2, 2, { 
          name: '신청 상태', 
          value: '✅ 승인됨',
          inline: true 
        }, { 
          name: '처리자', 
          value: interaction.user.tag,
          inline: true 
        });
      
      // 버튼 비활성화
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`registration_approve_${userId}`)
            .setLabel('승인됨')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`registration_reject_${userId}`)
            .setLabel('거부')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
            .setDisabled(true)
        );
      
      // 메시지 업데이트
      await message.edit({ 
        embeds: [updatedEmbed],
        components: [row]
      });
      
      // 멤버 찾기
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (member) {
        // DM 메시지 전송
        try {
          await member.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#43B581')
                .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
                .setTitle('✅ 가입 신청서 승인')
                .setDescription(`${member.user.tag}님의 가입 신청서가 승인되었습니다!`)
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                .addFields(
                  { name: '서버', value: interaction.guild.name, inline: true },
                  { name: '승인자', value: interaction.user.tag, inline: true },
                  { name: '승인 시간', value: new Date().toLocaleString('ko-KR'), inline: true }
                )
                .setTimestamp()
                .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
            ]
          });
        } catch (dmError) {
          logger.warn(this.name, `${member.user.tag}님에게 DM을 보낼 수 없습니다: ${dmError.message}`);
        }
      }
      
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#43B581')
            .setTitle('✅ 가입 신청서 승인 완료')
            .setDescription(`<@${userId}>님의 가입 신청서가 승인되었습니다.`)
            .setTimestamp()
            .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
        ],
        ephemeral: true
      });
      
      logger.success(this.name, `${interaction.user.tag}님이 ${userId} 유저의 가입 신청서를 승인했습니다.`);
    } catch (error) {
      logger.error(this.name, `가입 신청서 승인 오류: ${error.message}`);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#F04747')
            .setTitle('❌ 오류 발생')
            .setDescription('가입 신청서 승인 중 오류가 발생했습니다.')
            .setTimestamp()
            .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
        ],
        ephemeral: true
      });
    }
  }

  /**
   * 가입 신청서 거부 버튼 처리
   * @param {Interaction} interaction 버튼 상호작용 객체
   */
  async handleRejectButton(interaction) {
    try {
      // 승인 권한 체크
      const adminRoleId = config.get('modules.ticket.adminRoleId') || config.get('modules.registration.approvalRoleId');
      if (adminRoleId && !interaction.member.roles.cache.has(adminRoleId)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 권한 부족')
              .setDescription('가입 신청서를 거부할 권한이 없습니다.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ],
          ephemeral: true
        });
      }
      
      // 유저 ID 가져오기
      const userId = interaction.customId.split('_')[2];
      if (!userId) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 오류 발생')
              .setDescription('유저 ID를 찾을 수 없습니다.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ],
          ephemeral: true
        });
      }
      
      // 거부 사유 모달
      const modal = new ModalBuilder()
        .setCustomId(`registration_reject_reason_${userId}`)
        .setTitle('가입 신청서 거부 사유');
        
      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('거부 사유')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('거부 사유를 입력해주세요.')
        .setRequired(true)
        .setMaxLength(1000);
      
      const actionRow = new ActionRowBuilder().addComponents(reasonInput);
      
      modal.addComponents(actionRow);
      
      await interaction.showModal(modal);
    } catch (error) {
      logger.error(this.name, `가입 신청서 거부 모달 표시 오류: ${error.message}`);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#F04747')
            .setTitle('❌ 오류 발생')
            .setDescription('가입 신청서 거부 모달을 표시하는 중 오류가 발생했습니다.')
            .setTimestamp()
            .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
        ],
        ephemeral: true
      });
    }
  }

  /**
   * 가입 신청서 거부 사유 모달 처리
   * @param {Interaction} interaction 모달 인터렉션
   */
  async handleRejectReasonModal(interaction) {
    try {
      // 유저 ID 가져오기
      const userId = interaction.customId.split('_')[3];
      if (!userId) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#F04747')
              .setTitle('❌ 오류 발생')
              .setDescription('유저 ID를 찾을 수 없습니다.')
              .setTimestamp()
              .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
          ],
          ephemeral: true
        });
      }
      
      // 거부 사유 가져오기
      const reason = interaction.fields.getTextInputValue('reason');
      
      // 원본 메시지 업데이트
      const message = await interaction.message;
      const embed = message.embeds[0];
      
      // 임베드 업데이트
      const updatedEmbed = EmbedBuilder.from(embed)
        .setColor('#F04747')
        .spliceFields(embed.fields.length - 2, 2,
          { 
            name: '신청 상태', 
            value: '❌ 거부됨',
            inline: true 
          },
          { 
            name: '처리자', 
            value: interaction.user.tag,
            inline: true 
          },
          { 
            name: '📝 거부 사유', 
            value: reason || '사유 없음',
            inline: false 
          }
        );
      
      // 버튼 비활성화
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`registration_approve_${userId}`)
            .setLabel('승인')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`registration_reject_${userId}`)
            .setLabel('거부됨')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
            .setDisabled(true)
        );
      
      // 메시지 업데이트
      await message.edit({ 
        embeds: [updatedEmbed],
        components: [row]
      });
      
      // 멤버 찾기
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (member) {
        // DM 메시지 전송
        try {
          await member.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#F04747')
                .setAuthor({ name: 'Aimbot.ad', iconURL: 'https://imgur.com/Sd8qK9c.gif' })
                .setTitle('⛔ 가입 신청서 거부')
                .setDescription(`${member.user.tag}님의 가입 신청서가 거부되었습니다.`)
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                .addFields(
                  { name: '서버', value: interaction.guild.name, inline: true },
                  { name: '거부자', value: interaction.user.tag, inline: true },
                  { name: '거부 시간', value: new Date().toLocaleString('ko-KR'), inline: true },
                  { name: '거부 사유', value: reason || '사유 없음', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
            ]
          });
        } catch (dmError) {
          logger.warn(this.name, `${member.user.tag}님에게 DM을 보낼 수 없습니다: ${dmError.message}`);
        }
      }
      
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#F04747')
            .setTitle('⛔ 가입 신청서 거부 완료')
            .setDescription(`<@${userId}>님의 가입 신청서가 거부되었습니다.`)
            .addFields(
              { name: '거부 사유', value: reason || '사유 없음', inline: false }
            )
            .setTimestamp()
            .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
        ],
        ephemeral: true
      });
      
      logger.success(this.name, `${interaction.user.tag}님이 ${userId} 유저의 가입 신청서를 거부했습니다. 사유: ${reason || '사유 없음'}`);
    } catch (error) {
      logger.error(this.name, `가입 신청서 거부 처리 오류: ${error.message}`);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#F04747')
            .setTitle('❌ 오류 발생')
            .setDescription('가입 신청서 거부 처리 중 오류가 발생했습니다.')
            .setTimestamp()
            .setFooter({ text: '🎷Blues', iconURL: interaction.guild.iconURL() })
        ],
        ephemeral: true
      });
    }
  }
}

module.exports = (client) => new RegistrationModule(client);