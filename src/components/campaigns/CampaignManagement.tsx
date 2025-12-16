import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Search, Tag, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  created_at: string;
  lead_count?: number;
}

const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];

const CampaignManagement: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  
  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  
  // Form states
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formColor, setFormColor] = useState(PRESET_COLORS[5]);
  const [formIsActive, setFormIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      // Fetch campaigns
      const { data: campaignsData, error: campaignsError } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (campaignsError) throw campaignsError;

      // Fetch lead counts for each campaign
      const { data: contactsData, error: contactsError } = await supabase
        .from('contacts')
        .select('campaign')
        .not('campaign', 'is', null);

      if (contactsError) throw contactsError;

      // Count leads per campaign
      const leadCounts = new Map<string, number>();
      contactsData?.forEach(contact => {
        if (contact.campaign) {
          leadCounts.set(contact.campaign, (leadCounts.get(contact.campaign) || 0) + 1);
        }
      });

      // Merge lead counts
      const campaignsWithCounts = (campaignsData || []).map(c => ({
        ...c,
        lead_count: leadCounts.get(c.name) || 0
      }));

      setCampaigns(campaignsWithCounts);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      toast.error('Erro ao carregar campanhas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const openCreateModal = () => {
    setSelectedCampaign(null);
    setFormName('');
    setFormDescription('');
    setFormColor(PRESET_COLORS[5]);
    setFormIsActive(true);
    setEditModalOpen(true);
  };

  const openEditModal = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setFormName(campaign.name);
    setFormDescription(campaign.description || '');
    setFormColor(campaign.color);
    setFormIsActive(campaign.is_active);
    setEditModalOpen(true);
  };

  const openDeleteDialog = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Nome da campanha é obrigatório');
      return;
    }

    setSaving(true);
    try {
      if (selectedCampaign) {
        // Update existing
        const { error } = await supabase
          .from('campaigns')
          .update({
            name: formName.trim(),
            description: formDescription.trim() || null,
            color: formColor,
            is_active: formIsActive,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedCampaign.id);

        if (error) throw error;

        // If name changed, update contacts
        if (selectedCampaign.name !== formName.trim()) {
          await supabase
            .from('contacts')
            .update({ campaign: formName.trim() })
            .eq('campaign', selectedCampaign.name);
        }

        toast.success('Campanha atualizada');
      } else {
        // Create new
        const { error } = await supabase
          .from('campaigns')
          .insert({
            name: formName.trim(),
            description: formDescription.trim() || null,
            color: formColor,
            is_active: formIsActive
          });

        if (error) throw error;
        toast.success('Campanha criada');
      }

      setEditModalOpen(false);
      fetchCampaigns();
    } catch (error: any) {
      console.error('Error saving campaign:', error);
      if (error.code === '23505') {
        toast.error('Já existe uma campanha com este nome');
      } else {
        toast.error('Erro ao salvar campanha');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCampaign) return;

    try {
      // Remove campaign from contacts first
      await supabase
        .from('contacts')
        .update({ campaign: null })
        .eq('campaign', selectedCampaign.name);

      // Delete campaign
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', selectedCampaign.id);

      if (error) throw error;

      toast.success('Campanha excluída');
      setDeleteDialogOpen(false);
      fetchCampaigns();
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast.error('Erro ao excluir campanha');
    }
  };

  // Filter campaigns
  const filteredCampaigns = campaigns.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.description?.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesActive = showInactive || c.is_active;
    return matchesSearch && matchesActive;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Campanhas de Classificação</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie as campanhas para organizar seus contatos
          </p>
        </div>
        <Button onClick={openCreateModal} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Campanha
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar campanhas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="show-inactive"
            checked={showInactive}
            onCheckedChange={setShowInactive}
          />
          <Label htmlFor="show-inactive" className="text-sm text-muted-foreground">
            Mostrar inativas
          </Label>
        </div>
      </div>

      {/* Campaign List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-6 bg-muted rounded w-1/2 mb-2" />
                <div className="h-4 bg-muted rounded w-3/4 mb-4" />
                <div className="h-4 bg-muted rounded w-1/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <Card className="bg-card/50">
          <CardContent className="py-12 text-center">
            <Tag className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchQuery ? 'Nenhuma campanha encontrada' : 'Nenhuma campanha criada ainda'}
            </p>
            {!searchQuery && (
              <Button variant="outline" className="mt-4" onClick={openCreateModal}>
                Criar primeira campanha
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCampaigns.map(campaign => (
            <Card 
              key={campaign.id} 
              className={`relative overflow-hidden transition-all hover:shadow-lg ${
                !campaign.is_active ? 'opacity-60' : ''
              }`}
            >
              {/* Color bar */}
              <div 
                className="absolute top-0 left-0 right-0 h-1"
                style={{ backgroundColor: campaign.color }}
              />
              
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: campaign.color }}
                    />
                    <h3 className="font-semibold text-foreground truncate">
                      {campaign.name}
                    </h3>
                  </div>
                  {!campaign.is_active && (
                    <Badge variant="secondary" className="text-xs flex-shrink-0">
                      Inativa
                    </Badge>
                  )}
                </div>
                
                {campaign.description && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {campaign.description}
                  </p>
                )}
                
                <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{campaign.lead_count} leads</span>
                  </div>
                  <span>•</span>
                  <span>
                    {new Date(campaign.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                
                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditModal(campaign)}
                    className="gap-1"
                  >
                    <Pencil className="w-4 h-4" />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openDeleteDialog(campaign)}
                    className="gap-1 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Create Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedCampaign ? 'Editar Campanha' : 'Nova Campanha'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Campanha *</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Leads Maringá 2025"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Descrição opcional da campanha..."
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormColor(color)}
                    className={`w-8 h-8 rounded-full transition-all ${
                      formColor === color 
                        ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110' 
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Switch
                id="is-active"
                checked={formIsActive}
                onCheckedChange={setFormIsActive}
              />
              <Label htmlFor="is-active">Campanha Ativa</Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Campanha</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a campanha "{selectedCampaign?.name}"?
              {selectedCampaign?.lead_count && selectedCampaign.lead_count > 0 && (
                <span className="block mt-2 text-amber-500">
                  ⚠️ Esta campanha possui {selectedCampaign.lead_count} contatos associados. 
                  Eles serão desvinculados da campanha.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CampaignManagement;
